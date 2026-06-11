import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { billingService } from "../services/billing/billing.service";
import {
  stripeBillingService,
  StripeBillingError,
} from "../services/billing/stripe.service";
import { prisma } from "../lib/prisma";

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/billing/status", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const data = await billingService.getSnapshot(userId);
    return {
      data: {
        ...data,
        stripeConfigured: stripeBillingService.isConfigured(),
      },
    };
  });

  app.get("/billing/usage", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const data = await billingService.getRecentUsage(userId);
    return { data };
  });

  app.post("/billing/checkout", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      return reply.status(400).send({
        error: { code: "NO_EMAIL", message: "User email required for checkout" },
      });
    }

    try {
      const session = await stripeBillingService.createCheckoutSession(
        userId,
        user.email
      );
      return reply.send({ data: session });
    } catch (err) {
      if (err instanceof StripeBillingError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/billing/portal", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;

    try {
      const session = await stripeBillingService.createPortalSession(userId);
      return reply.send({ data: session });
    } catch (err) {
      if (err instanceof StripeBillingError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
