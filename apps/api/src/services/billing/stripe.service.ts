import type { PlanTier } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { getStripe, isStripeConfigured } from "../../lib/stripe";
import { billingAuditService } from "./billing-audit.service";
import { PLAN_LIMITS } from "./billing-plans";

export class StripeBillingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class StripeBillingService {
  isConfigured() {
    return isStripeConfigured() && Boolean(env.STRIPE_PRICE_PRO);
  }

  async getOrCreateCustomer(userId: string, email: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async createCheckoutSession(userId: string, email: string) {
    if (!this.isConfigured()) {
      throw new StripeBillingError(
        "STRIPE_NOT_CONFIGURED",
        "Stripe billing is not configured on this server",
        503
      );
    }

    const customerId = await this.getOrCreateCustomer(userId, email);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: env.STRIPE_PRICE_PRO!, quantity: 1 }],
      success_url: `${env.WEB_URL}/settings/billing?checkout=success`,
      cancel_url: `${env.WEB_URL}/settings/billing?checkout=cancelled`,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
      },
    });

    if (!session.url) {
      throw new StripeBillingError(
        "CHECKOUT_FAILED",
        "Stripe did not return a checkout URL",
        502
      );
    }

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(userId: string) {
    if (!isStripeConfigured()) {
      throw new StripeBillingError(
        "STRIPE_NOT_CONFIGURED",
        "Stripe billing is not configured",
        503
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new StripeBillingError(
        "NO_CUSTOMER",
        "No Stripe customer — subscribe first",
        400
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.WEB_URL}/settings/billing`,
    });

    return { url: session.url };
  }

  async syncPlanFromStripe(
    userId: string,
    plan: PlanTier,
    stripeSubscriptionId: string | null,
    renewsAt: Date | null,
    status: "active" | "cancelled" | "past_due" | "trialing" = "active"
  ) {
    const limits = PLAN_LIMITS[plan];

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status,
        stripeSubscriptionId,
        renewsAt,
        creditsBalance: limits.monthlyCredits ?? 999999,
        buildsLimit: limits.dailyAiRequests ?? 999999,
      },
      update: {
        plan,
        status,
        stripeSubscriptionId,
        renewsAt,
        buildsLimit: limits.dailyAiRequests ?? 999999,
      },
    });

    await billingAuditService.log({
      userId,
      action: "plan_changed",
      metadata: { plan, source: "stripe", stripeSubscriptionId },
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new StripeBillingError(
        "WEBHOOK_NOT_CONFIGURED",
        "STRIPE_WEBHOOK_SECRET missing",
        503
      );
    }

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature ?? "",
      env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (userId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const periodEnd =
            (sub as { current_period_end?: number }).current_period_end ??
            Math.floor(Date.now() / 1000) + 86400 * 30;
          await this.syncPlanFromStripe(
            userId,
            "pro",
            sub.id,
            new Date(periodEnd * 1000),
            sub.status === "active" ? "active" : "trialing"
          );
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        const plan: PlanTier =
          sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
        const periodEnd =
          (sub as { current_period_end?: number }).current_period_end ??
          Math.floor(Date.now() / 1000) + 86400 * 30;
        await this.syncPlanFromStripe(
          userId,
          plan,
          sub.id,
          new Date(periodEnd * 1000),
          sub.status === "past_due"
            ? "past_due"
            : sub.status === "canceled"
              ? "cancelled"
              : "active"
        );
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          await this.syncPlanFromStripe(userId, "free", null, null, "cancelled");
        }
        break;
      }
      default:
        break;
    }

    return { received: true };
  }
}

export const stripeBillingService = new StripeBillingService();
