import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { analyticsService } from "../services/analytics.service";
import {
  adminDashboardService,
  AdminDashboardError,
} from "../services/admin-dashboard.service";

const buildFilterSchema = z.enum(["ready", "failed", "building", "all"]).optional();

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/analytics/builds", async () => {
    const data = await analyticsService.getBuildAnalytics();
    return { data };
  });

  app.get("/admin/dashboard/overview", async () => {
    const data = await adminDashboardService.getOverview();
    return { data };
  });

  app.get("/admin/users", async () => {
    const data = await adminDashboardService.listUsers();
    return { data };
  });

  app.post("/admin/users/:userId/suspend", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const data = await adminDashboardService.suspendUser(userId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/reactivate", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const data = await adminDashboardService.reactivateUser(userId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/upgrade-pro", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const data = await adminDashboardService.upgradeUserToPro(userId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/reset-build-limits", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const data = await adminDashboardService.resetBuildLimits(userId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get("/admin/builds", async (request) => {
    const query = request.query as { status?: string };
    const parsed = buildFilterSchema.safeParse(query.status ?? "all");
    const filter = parsed.success ? parsed.data ?? "all" : "all";
    const data = await adminDashboardService.listBuildRuns(filter);
    return { data };
  });

  app.get("/admin/previews", async () => {
    const data = await adminDashboardService.listPreviews();
    return { data };
  });

  app.post("/admin/previews/:projectId/stop", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const data = await adminDashboardService.stopPreview(projectId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.delete("/admin/previews/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const data = await adminDashboardService.deletePreview(projectId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get("/admin/ai-analytics", async () => {
    const data = await adminDashboardService.getAiAnalytics();
    return { data };
  });

  app.get("/admin/health", async () => {
    const data = await adminDashboardService.getSystemHealth();
    return { data };
  });

  app.get("/admin/audit-logs", async () => {
    const data = await adminDashboardService.getAuditLogs();
    return { data };
  });
}

function handleAdminError(err: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  if (err instanceof AdminDashboardError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}
