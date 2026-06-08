import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { getAgentReadiness } from "../config/agent-readiness";
import {
  getSupabaseReadinessWithDb,
} from "../config/supabase-readiness";
import { previewService } from "./preview.service";
import {
  analyticsService,
  PlatformMetricEvents,
} from "./analytics.service";

const PRO_BUILDS_LIMIT = 100;
const AUDIT_LIMIT = 50;
const CHART_DAYS = 14;

export type BuildMonitorFilter = "ready" | "failed" | "building" | "all";

export class AdminDashboardError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class AdminDashboardService {
  async getOverview() {
    const [
      totalUsers,
      totalProjects,
      readyProjects,
      failedProjects,
      activePreviews,
      githubExports,
      costAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.project.count({ where: { status: "ready" } }),
      prisma.project.count({ where: { status: "failed" } }),
      prisma.preview.count({
        where: { status: { in: ["starting", "ready"] } },
      }),
      prisma.project.count({ where: { githubExportedAt: { not: null } } }),
      prisma.agentRun.aggregate({
        where: { agentType: "builder" },
        _sum: { estimatedCostUsd: true },
      }),
    ]);

    return {
      totalUsers,
      totalProjects,
      readyProjects,
      failedProjects,
      activePreviews,
      githubExports,
      estimatedAiCostUsd: costAgg._sum.estimatedCostUsd ?? 0,
    };
  }

  async listUsers() {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
        _count: { select: { projects: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      plan: u.subscription?.plan ?? "free",
      projectsCount: u._count.projects,
      buildsUsed: u.subscription?.buildsUsedThisPeriod ?? 0,
      buildsLimit: u.subscription?.buildsLimit ?? 3,
      status: u.subscription?.status ?? "active",
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async suspendUser(userId: string) {
    await this.ensureUser(userId);
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: "free",
        status: "cancelled",
      },
      update: { status: "cancelled" },
    });
    await prisma.userSession.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async reactivateUser(userId: string) {
    await this.ensureUser(userId);
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: "free",
        status: "active",
      },
      update: { status: "active" },
    });
    return { ok: true };
  }

  async upgradeUserToPro(userId: string) {
    await this.ensureUser(userId);
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: "pro",
        status: "active",
        buildsLimit: PRO_BUILDS_LIMIT,
      },
      update: {
        plan: "pro",
        status: "active",
        buildsLimit: PRO_BUILDS_LIMIT,
      },
    });

    await analyticsService.trackPlatform(
      PlatformMetricEvents.USER_UPGRADED,
      userId,
      undefined,
      { plan: "pro" }
    );

    const { billingAuditService } = await import("./billing/billing-audit.service");
    await billingAuditService.log({
      userId,
      action: "plan_changed",
      message: "Upgraded to Pro via admin",
      metadata: { plan: "pro" },
    });

    return { ok: true };
  }

  async resetBuildLimits(userId: string) {
    await this.ensureUser(userId);
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: "free", buildsUsedThisPeriod: 0 },
      update: { buildsUsedThisPeriod: 0, creditsBalance: 100 },
    });

    const { billingAuditService } = await import("./billing/billing-audit.service");
    await billingAuditService.log({
      userId,
      action: "credits_granted",
      message: "Quota reset via admin",
      metadata: { creditsBalance: 100 },
    });

    return { ok: true };
  }

  async listBuildRuns(filter: BuildMonitorFilter = "all") {
    const projectStatus =
      filter === "all"
        ? undefined
        : filter === "ready"
          ? "ready"
          : filter === "failed"
            ? "failed"
            : "building";

    const runs = await prisma.agentRun.findMany({
      where: {
        agentType: "builder",
        ...(projectStatus
          ? { project: { status: projectStatus } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { name: true, email: true } },
        project: { select: { name: true, status: true } },
      },
    });

    return runs.map((r) => ({
      id: r.id,
      userName: r.user.name,
      userEmail: r.user.email,
      projectName: r.project.name,
      projectStatus: r.project.status,
      provider: r.llmProvider ?? "unknown",
      status: r.status,
      durationMs: r.buildDurationMs,
      tokensInput: r.tokensInput,
      tokensOutput: r.tokensOutput,
      estimatedCostUsd: r.estimatedCostUsd,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listPreviews() {
    const previews = await prisma.preview.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    return previews.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      projectName: p.project.name,
      userName: p.project.user.name,
      userEmail: p.project.user.email,
      status: p.status,
      sandboxId: p.sandboxId,
      estimatedCostUsd: p.estimatedCostUsd,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    }));
  }

  async stopPreview(projectId: string) {
    const preview = await prisma.preview.findUnique({
      where: { projectId },
      include: { project: { select: { userId: true } } },
    });
    if (!preview) {
      throw new AdminDashboardError("NOT_FOUND", "Preview not found", 404);
    }

    await previewService.forceStop(projectId, preview.project.userId, {
      reason: "manual",
      sandboxId: preview.sandboxId,
      startedAt: preview.startedAt,
    });

    return { ok: true };
  }

  async deletePreview(projectId: string) {
    const preview = await prisma.preview.findUnique({
      where: { projectId },
      include: { project: { select: { userId: true } } },
    });
    if (!preview) {
      throw new AdminDashboardError("NOT_FOUND", "Preview not found", 404);
    }

    if (preview.sandboxId || preview.status === "starting" || preview.status === "ready") {
      await previewService.forceStop(projectId, preview.project.userId, {
        reason: "manual",
        sandboxId: preview.sandboxId,
        startedAt: preview.startedAt,
      });
    }

    await prisma.preview.delete({ where: { projectId } }).catch(() => undefined);
    await prisma.project.update({
      where: { id: projectId },
      data: { previewUrl: null },
    });

    return { ok: true };
  }

  async getAiAnalytics() {
    const since = new Date();
    since.setDate(since.getDate() - CHART_DAYS);

    const runs = await prisma.agentRun.findMany({
      where: {
        agentType: "builder",
        createdAt: { gte: since },
      },
      select: {
        status: true,
        tokensInput: true,
        tokensOutput: true,
        estimatedCostUsd: true,
        createdAt: true,
      },
    });

    const byDay = new Map<
      string,
      {
        builds: number;
        successful: number;
        failed: number;
        tokensInput: number;
        tokensOutput: number;
        costUsd: number;
      }
    >();

    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, {
        builds: 0,
        successful: 0,
        failed: 0,
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0,
      });
    }

    for (const run of runs) {
      const key = run.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      bucket.builds += 1;
      if (run.status === "completed") bucket.successful += 1;
      if (run.status === "failed") bucket.failed += 1;
      bucket.tokensInput += run.tokensInput;
      bucket.tokensOutput += run.tokensOutput;
      bucket.costUsd += run.estimatedCostUsd ?? 0;
    }

    const daily = [...byDay.entries()].map(([date, stats]) => ({
      date,
      ...stats,
      successRate: stats.builds > 0 ? stats.successful / stats.builds : 0,
    }));

    const totalBuilds = runs.length;
    const successful = runs.filter((r) => r.status === "completed").length;

    return {
      daily,
      summary: {
        totalBuilds,
        successRate: totalBuilds > 0 ? successful / totalBuilds : 0,
        totalTokensInput: runs.reduce((s, r) => s + r.tokensInput, 0),
        totalTokensOutput: runs.reduce((s, r) => s + r.tokensOutput, 0),
        totalCostUsd: runs.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0),
      },
    };
  }

  async getSystemHealth() {
    const agents = getAgentReadiness();
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }

    const supabase = await getSupabaseReadinessWithDb();

    return {
      database,
      supabase: {
        configured: supabase.configured,
        database: supabase.database,
        auth: supabase.auth,
        storage: supabase.storage,
      },
      deepseek: {
        configured: env.DEEPSEEK_API_KEY.length > 0,
        active: agents.provider === "deepseek" && agents.configured,
        provider: agents.provider,
      },
      github: {
        configured: env.JWT_SECRET.length >= 32,
        dedicatedEncryptionKey: !!process.env.GITHUB_TOKEN_ENCRYPTION_KEY,
      },
      e2b: {
        configured: env.E2B_API_KEY.length > 0,
        template: env.E2B_PREVIEW_TEMPLATE,
      },
    };
  }

  async getAuditLogs() {
    const [events, recentBuilds, recentExports] = await Promise.all([
      prisma.analyticsEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: AUDIT_LIMIT,
        include: {
          user: { select: { email: true, name: true } },
          project: { select: { name: true } },
        },
      }),
      prisma.agentRun.findMany({
        where: {
          agentType: "builder",
          status: { in: ["completed", "failed"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: { select: { email: true } },
          project: { select: { name: true } },
        },
      }),
      prisma.project.findMany({
        where: { githubExportedAt: { not: null } },
        orderBy: { githubExportedAt: "desc" },
        take: 10,
        include: { user: { select: { email: true } } },
      }),
    ]);

    type AuditEntry = {
      id: string;
      type: string;
      message: string;
      userEmail: string | null;
      projectName: string | null;
      createdAt: string;
    };

    const entries: AuditEntry[] = [];

    for (const run of recentBuilds) {
      entries.push({
        id: run.id,
        type: run.status === "completed" ? "build.completed" : "build.failed",
        message:
          run.status === "completed"
            ? `Build completed for ${run.project.name}`
            : `Build failed for ${run.project.name}${run.errorCode ? ` (${run.errorCode})` : ""}`,
        userEmail: run.user.email,
        projectName: run.project.name,
        createdAt: run.createdAt.toISOString(),
      });
    }

    for (const p of recentExports) {
      entries.push({
        id: p.id,
        type: "github.export",
        message: `GitHub export: ${p.githubRepoFullName ?? p.name}`,
        userEmail: p.user.email,
        projectName: p.name,
        createdAt: (p.githubExportedAt ?? p.updatedAt).toISOString(),
      });
    }

    for (const e of events) {
      const type = this.mapEventType(e.eventType);
      if (!type) continue;
      entries.push({
        id: e.id,
        type,
        message: this.formatEventMessage(e.eventType, e.metadata),
        userEmail: e.user?.email ?? null,
        projectName: e.project?.name ?? null,
        createdAt: e.createdAt.toISOString(),
      });
    }

    entries.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return entries.slice(0, AUDIT_LIMIT);
  }

  private mapEventType(eventType: string): string | null {
    switch (eventType) {
      case PlatformMetricEvents.PREVIEW_STARTED:
      case PlatformMetricEvents.PREVIEW_READY:
        return "preview.created";
      case PlatformMetricEvents.USER_UPGRADED:
        return "user.upgraded";
      case PlatformMetricEvents.BUILD_LIMIT_REACHED:
        return "build.limit_reached";
      default:
        return null;
    }
  }

  private formatEventMessage(
    eventType: string,
    metadata: unknown
  ): string {
    const meta =
      metadata && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : {};
    switch (eventType) {
      case PlatformMetricEvents.PREVIEW_STARTED:
        return "Preview provisioning started";
      case PlatformMetricEvents.PREVIEW_READY:
        return "Preview ready";
      case PlatformMetricEvents.USER_UPGRADED:
        return `User upgraded to ${String(meta.plan ?? "pro")}`;
      case PlatformMetricEvents.BUILD_LIMIT_REACHED:
        return "Build limit reached";
      default:
        return eventType;
    }
  }

  private async ensureUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AdminDashboardError("NOT_FOUND", "User not found", 404);
    }
  }
}

export const adminDashboardService = new AdminDashboardService();
