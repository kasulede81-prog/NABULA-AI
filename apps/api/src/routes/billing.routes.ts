import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { billingService } from "../services/billing/billing.service";

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/billing/status", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const data = await billingService.getSnapshot(userId);
    return { data };
  });

  app.get("/billing/usage", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const data = await billingService.getRecentUsage(userId);
    return { data };
  });
}
