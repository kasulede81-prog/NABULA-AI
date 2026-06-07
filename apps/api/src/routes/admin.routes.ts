import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { analyticsService } from "../services/analytics.service";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/analytics/builds", async () => {
    const data = await analyticsService.getBuildAnalytics();
    return { data };
  });
}
