import type { CreditLedgerType, PlanTier, Prisma } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { PLAN_LIMITS, isUnlimitedPlan } from "./billing-plans";
import { billingAuditService } from "./billing-audit.service";

export class BillingCreditsService {
  async getBalance(userId: string): Promise<number> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    return sub?.creditsBalance ?? 0;
  }

  async grantCredits(
    userId: string,
    amount: number,
    type: CreditLedgerType,
    metadata?: Prisma.InputJsonValue
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { userId } });
      if (!sub) return 0;

      const balanceAfter = sub.creditsBalance + amount;
      await tx.subscription.update({
        where: { userId },
        data: { creditsBalance: balanceAfter },
      });

      await tx.creditLedger.create({
        data: {
          userId,
          type,
          amount,
          balanceAfter,
          metadata,
        },
      });

      await billingAuditService.log({
        userId,
        action: "credits_granted",
        metadata: { amount, type, balanceAfter },
      });

      return balanceAfter;
    });
  }

  async deductCredits(
    userId: string,
    amount: number,
    plan: PlanTier,
    metadata?: Prisma.InputJsonValue
  ): Promise<number> {
    if (amount <= 0 || isUnlimitedPlan(plan)) {
      return this.getBalance(userId);
    }

    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { userId } });
      if (!sub) {
        throw new Error("Subscription not found");
      }

      if (sub.creditsBalance < amount) {
        throw new Error("INSUFFICIENT_CREDITS");
      }

      const balanceAfter = sub.creditsBalance - amount;
      await tx.subscription.update({
        where: { userId },
        data: { creditsBalance: balanceAfter },
      });

      await tx.creditLedger.create({
        data: {
          userId,
          type: "consumption",
          amount: -amount,
          balanceAfter,
          metadata: metadata ?? undefined,
        },
      });

      return balanceAfter;
    });
  }

  async ensureMonthlyGrant(userId: string, plan: PlanTier, renewsAt: Date | null) {
    const limits = PLAN_LIMITS[plan];
    if (limits.monthlyCredits === null) return;

    const now = new Date();
    if (renewsAt && renewsAt > now) return;

    const nextRenews = new Date(now);
    nextRenews.setMonth(nextRenews.getMonth() + 1);

    // Atomic claim: the renewsAt guard in the WHERE clause means only one
    // concurrent request performs the grant — others see count === 0.
    const claimed = await prisma.subscription.updateMany({
      where: {
        userId,
        OR: [{ renewsAt: null }, { renewsAt: { lte: now } }],
      },
      data: {
        creditsBalance: limits.monthlyCredits,
        renewsAt: nextRenews,
        buildsUsedThisPeriod: 0,
      },
    });
    if (claimed.count === 0) return;

    await prisma.creditLedger.create({
      data: {
        userId,
        type: "monthly_grant",
        amount: limits.monthlyCredits,
        balanceAfter: limits.monthlyCredits,
        metadata: { plan },
      },
    });

    await billingAuditService.log({
      userId,
      action: "credits_granted",
      message: "Monthly credit grant",
      metadata: { amount: limits.monthlyCredits, plan },
    });
  }
}

export const billingCreditsService = new BillingCreditsService();
