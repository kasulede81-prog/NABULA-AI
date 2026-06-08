import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { analyticsService } from "../services/analytics.service";
import {
  adminDashboardService,
  AdminDashboardError,
} from "../services/admin-dashboard.service";
import { adminPhase2Service } from "../services/admin-phase2.service";
import { adminAuditService } from "../services/admin-audit.service";
import { billingService } from "../services/billing/billing.service";
import { supportService, SupportError } from "../services/support/support.service";
import { errorMonitorService } from "../services/stability/error-monitor.service";
import { feedbackService } from "../services/stability/feedback.service";
import { recoveryService, RecoveryError } from "../services/stability/recovery.service";
import { stabilityHealthService } from "../services/stability/stability-health.service";
import { prisma } from "../lib/prisma";
import type { ErrorSource, FeedbackStatus } from "@nebula/database";

const supportMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

const upgradeActionSchema = z.object({
  notes: z.string().max(500).optional(),
});

const buildFilterSchema = z.enum(["ready", "failed", "building", "all"]).optional();
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  action: z.string().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/me", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const access = await adminPhase2Service.checkAdminAccess(
      userId,
      user?.email ?? ""
    );
    if (access.isAdmin) {
      await adminAuditService.log({
        adminUserId: userId,
        action: "admin_login",
        targetType: "admin",
        targetId: userId,
        targetLabel: user?.email,
      });
    }
    return {
      data: {
        ...access,
        name: user?.name ?? null,
        userId,
      },
    };
  });

  app.get("/admin/dashboard/overview", async () => {
    const [legacy, extended] = await Promise.all([
      adminDashboardService.getOverview(),
      adminPhase2Service.getOverviewExtended(),
    ]);
    return { data: { ...legacy, ...extended } };
  });

  app.get("/admin/users", async (request) => {
    const query = paginationSchema.parse(request.query);
    const data = await adminPhase2Service.listUsersPaginated(query);
    return { data };
  });

  app.get("/admin/users/:userId", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const data = await adminPhase2Service.getUserDetail(userId);
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/suspend", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const data = await adminDashboardService.suspendUser(userId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "user_suspended",
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/reactivate", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const data = await adminDashboardService.reactivateUser(userId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "user_reactivated",
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/upgrade-pro", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const data = await adminDashboardService.upgradeUserToPro(userId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "user_upgraded",
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email,
        metadata: { plan: "pro" },
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/users/:userId/reset-build-limits", async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const data = await adminDashboardService.resetBuildLimits(userId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "user_quota_reset",
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get("/admin/projects", async (request) => {
    const query = paginationSchema.parse(request.query);
    const data = await adminPhase2Service.listProjectsPaginated(query);
    return { data };
  });

  app.delete("/admin/projects/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const result = await adminPhase2Service.deleteProject(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "project_deleted",
        targetType: "project",
        targetId: projectId,
        targetLabel: result.name,
      });
      return { data: result };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/projects/:projectId/force-rebuild", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const data = await adminPhase2Service.forceRebuild(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "project_force_rebuild",
        targetType: "project",
        targetId: projectId,
        targetLabel: project?.name,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/projects/:projectId/force-preview-restart", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const data = await adminPhase2Service.restartPreview(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "preview_restart",
        targetType: "project",
        targetId: projectId,
        targetLabel: project?.name,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get("/admin/analytics/builds", async () => {
    const data = await analyticsService.getBuildAnalytics();
    return { data };
  });

  app.get("/admin/builds", async (request) => {
    const query = request.query as { status?: string; page?: string; limit?: string };
    const parsed = buildFilterSchema.safeParse(query.status ?? "all");
    const filter = parsed.success ? parsed.data ?? "all" : "all";

    if (query.page || query.limit) {
      const extended = await adminPhase2Service.getBuildAnalyticsExtended();
      const runs = await adminDashboardService.listBuildRuns(filter);
      return {
        data: {
          runs,
          analytics: extended,
        },
      };
    }

    const data = await adminDashboardService.listBuildRuns(filter);
    return { data };
  });

  app.get("/admin/builds/analytics", async () => {
    const data = await adminPhase2Service.getBuildAnalyticsExtended();
    return { data };
  });

  app.get("/admin/previews", async () => {
    const data = await adminPhase2Service.listPreviewsExtended();
    return { data };
  });

  app.post("/admin/previews/:projectId/stop", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const data = await adminDashboardService.stopPreview(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "preview_stopped",
        targetType: "project",
        targetId: projectId,
        targetLabel: project?.name,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post("/admin/previews/:projectId/restart", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const data = await adminPhase2Service.restartPreview(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "preview_restart",
        targetType: "project",
        targetId: projectId,
        targetLabel: project?.name,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.delete("/admin/previews/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const data = await adminDashboardService.deletePreview(projectId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "preview_deleted",
        targetType: "project",
        targetId: projectId,
        targetLabel: project?.name,
      });
      return { data };
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get("/admin/ai-analytics", async () => {
    const data = await adminDashboardService.getAiAnalytics();
    return { data };
  });

  app.get("/admin/ai", async () => {
    const data = await adminPhase2Service.getAiUsage();
    return { data };
  });

  app.get("/admin/health", async () => {
    const data = await adminDashboardService.getSystemHealth();
    return { data };
  });

  app.get("/admin/system", async () => {
    const [base, stability] = await Promise.all([
      adminPhase2Service.getSystemHealthExtended(),
      stabilityHealthService.getExtendedChecks(),
    ]);
    const mergedServices = [
      ...base.services,
      ...stability.services.filter(
        (s) => !base.services.some((b) => b.service === s.service)
      ),
    ];
    return {
      data: {
        ...base,
        services: mergedServices,
        backup: stability.backup,
        rateLimits: (
          await import("../services/stability/rate-limit.service")
        ).rateLimitService.getLimits(),
      },
    };
  });

  app.get("/admin/errors", async (request) => {
    const query = paginationSchema.parse(request.query);
    const rawSource = (request.query as { source?: string }).source;
    const source =
      rawSource &&
      (["api", "preview", "github", "ai_provider"] as const).includes(
        rawSource as ErrorSource
      )
        ? (rawSource as ErrorSource)
        : undefined;
    const [events, stats] = await Promise.all([
      errorMonitorService.listEvents({
        search: query.search,
        source,
        page: query.page,
        limit: query.limit,
      }),
      errorMonitorService.getStats(),
    ]);
    return { data: { events, stats } };
  });

  app.get("/admin/feedback", async (request) => {
    const query = paginationSchema.parse(request.query);
    const data = await feedbackService.listForAdmin({
      status: query.status as FeedbackStatus | undefined,
      page: query.page,
      limit: query.limit,
    });
    return { data };
  });

  app.patch("/admin/feedback/:feedbackId", async (request, reply) => {
    const { feedbackId } = request.params as { feedbackId: string };
    const body = z.object({ status: z.enum(["open", "reviewed", "closed"]) }).safeParse(
      request.body
    );
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.message },
      });
    }
    const data = await feedbackService.updateStatus(feedbackId, body.data.status);
    return { data };
  });

  app.post("/admin/projects/:projectId/retry-build", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const data = await recoveryService.retryBuild(projectId, adminId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "build_retried",
        targetType: "project",
        targetId: projectId,
      });
      return { data };
    } catch (err) {
      return handleRecoveryError(err, reply);
    }
  });

  app.post("/admin/projects/:projectId/retry-preview", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const data = await recoveryService.retryPreview(projectId, adminId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "preview_retried",
        targetType: "project",
        targetId: projectId,
      });
      return { data };
    } catch (err) {
      return handleRecoveryError(err, reply);
    }
  });

  app.post("/admin/projects/:projectId/retry-github-sync", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const data = await recoveryService.retryGithubSync(projectId, adminId);
      await adminAuditService.log({
        adminUserId: adminId,
        action: "github_sync_retried",
        targetType: "project",
        targetId: projectId,
      });
      return { data };
    } catch (err) {
      return handleRecoveryError(err, reply);
    }
  });

  app.get("/admin/audit-logs", async () => {
    const data = await adminDashboardService.getAuditLogs();
    return { data };
  });

  app.get("/admin/github", async () => {
    const data = await adminPhase2Service.getGithubStats();
    return { data };
  });

  app.get("/admin/billing", async () => {
    const [stats, pendingUpgrades] = await Promise.all([
      billingService.getAdminStats(),
      supportService.listPendingUpgrades(),
    ]);
    return { data: { ...stats, pendingUpgrades } };
  });

  app.get("/admin/support/notifications", async () => {
    const data = await supportService.getAdminNotifications();
    return { data };
  });

  app.get("/admin/support/conversations", async (request, reply) => {
    try {
      const data = await supportService.listAdminConversations();
      return { data };
    } catch (err) {
      return handleSupportAdminError(err, reply);
    }
  });

  app.get("/admin/support/conversations/:conversationId", async (request, reply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const data = await supportService.getAdminConversation(conversationId);
      return { data };
    } catch (err) {
      return handleSupportAdminError(err, reply);
    }
  });

  app.post("/admin/support/conversations/:conversationId/messages", async (request, reply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const parsed = supportMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        });
      }
      const data = await supportService.sendAdminMessage(
        conversationId,
        adminId,
        parsed.data.message
      );
      return reply.status(201).send({ data });
    } catch (err) {
      return handleSupportAdminError(err, reply);
    }
  });

  app.get("/admin/upgrade-requests/pending", async () => {
    const data = await supportService.listPendingUpgrades();
    return { data };
  });

  app.post("/admin/upgrade-requests/:requestId/approve", async (request, reply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const parsed = upgradeActionSchema.safeParse(request.body ?? {});
      const data = await supportService.approveUpgrade(
        requestId,
        adminId,
        parsed.success ? parsed.data.notes : undefined
      );
      return { data };
    } catch (err) {
      return handleSupportAdminError(err, reply);
    }
  });

  app.post("/admin/upgrade-requests/:requestId/reject", async (request, reply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      const { userId: adminId } = request as AuthenticatedRequest;
      const parsed = upgradeActionSchema.safeParse(request.body ?? {});
      const data = await supportService.rejectUpgrade(
        requestId,
        adminId,
        parsed.success ? parsed.data.notes : undefined
      );
      return { data };
    } catch (err) {
      return handleSupportAdminError(err, reply);
    }
  });

  app.get("/admin/audit", async (request) => {
    const query = paginationSchema.parse(request.query);
    const data = await adminAuditService.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      action: query.action as import("@nebula/database").AdminAuditAction | undefined,
    });
    return { data };
  });
}

function handleAdminError(
  err: unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
) {
  if (err instanceof AdminDashboardError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

function handleSupportAdminError(
  err: unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
) {
  if (err instanceof SupportError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

function handleRecoveryError(
  err: unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
) {
  if (err instanceof RecoveryError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}
