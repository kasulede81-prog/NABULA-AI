import type { Prisma, SystemServiceStatus } from "@nebula/database";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { getAgentReadiness } from "../config/agent-readiness";
import { getSupabaseReadinessWithDb } from "../config/supabase-readiness";
import { previewService } from "./preview.service";
import { buildService } from "./build.service";
import { analyticsService } from "./analytics.service";
import { AdminDashboardError } from "./admin-dashboard.service";

const ACTIVE_USER_DAYS = 30;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function trendDir(change: number | null): "up" | "down" | "flat" {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

export class AdminPhase2Service {
  async getOverviewExtended() {
    const today = startOfToday();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const monthStart = startOfMonth();
    const activeSince = new Date();
    activeSince.setDate(activeSince.getDate() - ACTIVE_USER_DAYS);

    const [
      totalUsers,
      activeUsers,
      totalProjects,
      projectsToday,
      projectsYesterday,
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      activePreviews,
      previewFailures,
      monthlyAiRequests,
      prevMonthAiRequests,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          OR: [
            { projects: { some: { updatedAt: { gte: activeSince } } } },
            { agentRuns: { some: { createdAt: { gte: activeSince } } } },
          ],
        },
      }),
      prisma.project.count(),
      prisma.project.count({ where: { createdAt: { gte: today } } }),
      prisma.project.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
      prisma.agentRun.count({ where: { agentType: "builder" } }),
      prisma.agentRun.count({
        where: { agentType: "builder", status: "completed" },
      }),
      prisma.agentRun.count({
        where: { agentType: "builder", status: "failed" },
      }),
      prisma.preview.count({
        where: { status: { in: ["starting", "ready"] } },
      }),
      prisma.preview.count({ where: { status: "error" } }),
      prisma.agentRun.count({
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.agentRun.count({
        where: {
          createdAt: {
            gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
            lt: monthStart,
          },
        },
      }),
    ]);

    const buildSuccessRate =
      totalBuilds > 0 ? Math.round((successfulBuilds / totalBuilds) * 1000) / 10 : 0;
    const buildFailureRate =
      totalBuilds > 0 ? Math.round((failedBuilds / totalBuilds) * 1000) / 10 : 0;
    const projectsTodayChange = pctChange(projectsToday, projectsYesterday);
    const aiRequestsChange = pctChange(monthlyAiRequests, prevMonthAiRequests);

    return {
      totalUsers,
      activeUsers,
      totalProjects,
      projectsCreatedToday: projectsToday,
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      buildSuccessRate,
      buildFailureRate,
      activePreviews,
      previewFailures,
      monthlyAiRequests,
      trends: {
        projectsToday: {
          changePercent: projectsTodayChange,
          direction: trendDir(projectsTodayChange),
        },
        monthlyAiRequests: {
          changePercent: aiRequestsChange,
          direction: trendDir(aiRequestsChange),
        },
        buildSuccessRate: { value: buildSuccessRate, direction: "flat" as const },
      },
    };
  }

  async listUsersPaginated(opts: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    if (opts.status && opts.status !== "all") {
      where.subscription = { status: opts.status as Prisma.EnumSubscriptionStatusFilter["equals"] };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          subscription: true,
          _count: { select: { projects: true, agentRuns: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        plan: u.subscription?.plan ?? "free",
        projectsCount: u._count.projects,
        buildsUsed: u.subscription?.buildsUsedThisPeriod ?? 0,
        buildsLimit: u.subscription?.buildsLimit ?? 3,
        status: u.subscription?.status ?? "active",
        agentRuns: u._count.agentRuns,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        projects: {
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            name: true,
            status: true,
            buildCount: true,
            createdAt: true,
          },
        },
        _count: { select: { projects: true, agentRuns: true } },
      },
    });
    if (!user) throw new AdminDashboardError("NOT_FOUND", "User not found", 404);

    const buildStats = await prisma.agentRun.groupBy({
      by: ["status"],
      where: { userId, agentType: "builder" },
      _count: true,
    });

    const { userActivityService } = await import("./stability/user-activity.service");
    const activity = await userActivityService.getActivity(userId);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.subscription?.plan ?? "free",
      status: user.subscription?.status ?? "active",
      buildsUsed: user.subscription?.buildsUsedThisPeriod ?? 0,
      buildsLimit: user.subscription?.buildsLimit ?? 3,
      projectsCount: user._count.projects,
      agentRuns: user._count.agentRuns,
      activity,
      projects: user.projects.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      buildStats: buildStats.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async listProjectsPaginated(opts: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {};
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (opts.status && opts.status !== "all") {
      where.status = opts.status as Prisma.EnumProjectStatusFilter["equals"];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          preview: { select: { status: true, phase: true, url: true } },
          _count: { select: { files: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return {
      items: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        ownerId: p.user.id,
        ownerName: p.user.name,
        ownerEmail: p.user.email,
        filesCount: p._count.files,
        buildsCount: p.buildCount,
        previewStatus: p.preview?.status ?? null,
        previewPhase: p.preview?.phase ?? null,
        previewUrl: p.preview?.url ?? p.previewUrl,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deleteProject(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { preview: true },
    });
    if (!project) throw new AdminDashboardError("NOT_FOUND", "Project not found", 404);

    if (project.preview?.sandboxId) {
      await previewService.forceStop(projectId, project.userId, {
        reason: "manual",
        sandboxId: project.preview.sandboxId,
        startedAt: project.preview.startedAt,
      });
    }

    await prisma.project.delete({ where: { id: projectId } });
    return { ok: true, name: project.name };
  }

  async forceRebuild(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AdminDashboardError("NOT_FOUND", "Project not found", 404);
    if (!project.specJson) {
      throw new AdminDashboardError("NO_SPEC", "Project has no spec to rebuild", 422);
    }

    buildService.scheduleBuilder(projectId, project.userId, "Admin force rebuild");
    return { ok: true };
  }

  async restartPreview(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { preview: true },
    });
    if (!project) throw new AdminDashboardError("NOT_FOUND", "Project not found", 404);

    if (project.preview) {
      await previewService.forceStop(projectId, project.userId, {
        reason: "manual",
        sandboxId: project.preview.sandboxId,
        startedAt: project.preview.startedAt,
      });
    }

    previewService.scheduleStart(projectId, project.userId);
    return { ok: true };
  }

  async getBuildAnalyticsExtended() {
    const analytics = await analyticsService.getBuildAnalytics();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const runs = await prisma.agentRun.findMany({
      where: { agentType: "builder", createdAt: { gte: since } },
      select: {
        status: true,
        buildDurationMs: true,
        createdAt: true,
        errorCode: true,
      },
    });

    const byDay = new Map<string, { total: number; success: number; failed: number; durations: number[] }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      byDay.set(d.toISOString().slice(0, 10), { total: 0, success: 0, failed: 0, durations: [] });
    }

    const errorCounts = new Map<string, number>();
    for (const run of runs) {
      const key = run.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.total += 1;
        if (run.status === "completed") bucket.success += 1;
        if (run.status === "failed") bucket.failed += 1;
        if (run.buildDurationMs) bucket.durations.push(run.buildDurationMs);
      }
      if (run.status === "failed" && run.errorCode) {
        errorCounts.set(run.errorCode, (errorCounts.get(run.errorCode) ?? 0) + 1);
      }
    }

    const buildsPerDay = [...byDay.entries()].map(([date, b]) => ({
      date,
      total: b.total,
      success: b.success,
      failed: b.failed,
      avgDurationMs:
        b.durations.length > 0
          ? Math.round(b.durations.reduce((a, c) => a + c, 0) / b.durations.length)
          : null,
    }));

    const topErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }));

    return {
      summary: {
        totalBuilds: analytics.totalBuilds,
        successfulBuilds: analytics.successfulBuilds,
        failedBuilds: analytics.failedBuilds,
        successRate: Math.round(analytics.successRate * 1000) / 10,
        failureRate: Math.round((1 - analytics.successRate) * 1000) / 10,
        averageBuildDurationMs: analytics.averageBuildDurationMs,
      },
      buildsPerDay,
      topErrors,
      buildsByProvider: analytics.buildsByProvider,
    };
  }

  async getAiUsage() {
    const agents = getAgentReadiness();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const runs = await prisma.agentRun.findMany({
      where: { createdAt: { gte: since } },
      select: {
        agentType: true,
        status: true,
        llmProvider: true,
        tokensInput: true,
        tokensOutput: true,
        estimatedCostUsd: true,
        createdAt: true,
      },
    });

    const byProvider = new Map<
      string,
      { requests: number; failed: number; tokensIn: number; tokensOut: number; cost: number }
    >();
    const byDay = new Map<string, { tokensIn: number; tokensOut: number; requests: number }>();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      byDay.set(d.toISOString().slice(0, 10), { tokensIn: 0, tokensOut: 0, requests: 0 });
    }

    for (const run of runs) {
      const provider = run.llmProvider ?? agents.provider ?? "unknown";
      const p = byProvider.get(provider) ?? {
        requests: 0,
        failed: 0,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
      };
      p.requests += 1;
      if (run.status === "failed") p.failed += 1;
      p.tokensIn += run.tokensInput;
      p.tokensOut += run.tokensOutput;
      p.cost += run.estimatedCostUsd ?? 0;
      byProvider.set(provider, p);

      const dayKey = run.createdAt.toISOString().slice(0, 10);
      const day = byDay.get(dayKey);
      if (day) {
        day.requests += 1;
        day.tokensIn += run.tokensInput;
        day.tokensOut += run.tokensOutput;
      }
    }

    const monthStart = startOfMonth();
    await this.syncUsageMetrics(runs.filter((r) => r.createdAt >= monthStart));

    const totalRequests = runs.length;
    const totalFailed = runs.filter((r) => r.status === "failed").length;
    const totalTokensIn = runs.reduce((s, r) => s + r.tokensInput, 0);
    const totalTokensOut = runs.reduce((s, r) => s + r.tokensOutput, 0);
    const totalCost = runs.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);

    return {
      currentProvider: agents.provider,
      configured: agents.configured,
      totalRequests,
      totalFailed,
      totalTokensInput: totalTokensIn,
      totalTokensOutput: totalTokensOut,
      estimatedCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
      providerBreakdown: [...byProvider.entries()].map(([provider, stats]) => ({
        provider,
        ...stats,
        estimatedCostUsd: Math.round(stats.cost * 1_000_000) / 1_000_000,
      })),
      dailyTokenUsage: [...byDay.entries()].map(([date, d]) => ({
        date,
        requests: d.requests,
        tokensInput: d.tokensIn,
        tokensOutput: d.tokensOut,
      })),
      deepseek: {
        requests: byProvider.get("deepseek")?.requests ?? 0,
        failed: byProvider.get("deepseek")?.failed ?? 0,
      },
      anthropic: {
        requests: byProvider.get("anthropic")?.requests ?? 0,
        failed: byProvider.get("anthropic")?.failed ?? 0,
      },
    };
  }

  private async syncUsageMetrics(
    runs: Array<{
      llmProvider: string | null;
      status: string;
      tokensInput: number;
      tokensOutput: number;
      estimatedCostUsd: number | null;
      createdAt: Date;
    }>
  ) {
    const grouped = new Map<
      string,
      { requests: number; failed: number; tokensIn: number; tokensOut: number; cost: number }
    >();

    for (const run of runs) {
      const provider = run.llmProvider ?? "unknown";
      const dateKey = run.createdAt.toISOString().slice(0, 10);
      const key = `${dateKey}:${provider}`;
      const g = grouped.get(key) ?? { requests: 0, failed: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
      g.requests += 1;
      if (run.status === "failed") g.failed += 1;
      g.tokensIn += run.tokensInput;
      g.tokensOut += run.tokensOutput;
      g.cost += run.estimatedCostUsd ?? 0;
      grouped.set(key, g);
    }

    for (const [key, stats] of grouped) {
      const [dateStr, provider] = key.split(":");
      const date = new Date(`${dateStr}T00:00:00.000Z`);
      await prisma.usageMetric.upsert({
        where: { date_provider: { date, provider } },
        create: {
          date,
          provider,
          requestCount: stats.requests,
          failedCount: stats.failed,
          tokensInput: stats.tokensIn,
          tokensOutput: stats.tokensOut,
          estimatedCostUsd: stats.cost,
        },
        update: {
          requestCount: stats.requests,
          failedCount: stats.failed,
          tokensInput: stats.tokensIn,
          tokensOutput: stats.tokensOut,
          estimatedCostUsd: stats.cost,
        },
      });
    }
  }

  async listPreviewsExtended() {
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

    const now = Date.now();
    return previews.map((p) => {
      const started = p.startedAt ?? p.createdAt;
      const sandboxAgeMs = p.sandboxId ? now - started.getTime() : null;
      return {
        id: p.id,
        projectId: p.projectId,
        projectName: p.project.name,
        userName: p.project.user.name,
        userEmail: p.project.user.email,
        status: p.status,
        phase: p.phase,
        previewUrl: p.url,
        sandboxId: p.sandboxId,
        sandboxAgeMs,
        sandboxAgeMinutes:
          sandboxAgeMs !== null ? Math.round(sandboxAgeMs / 60_000) : null,
        errorCode: p.errorCode,
        errorMessage: p.errorMessage,
        estimatedCostUsd: p.estimatedCostUsd,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        startedAt: p.startedAt?.toISOString() ?? null,
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async getSystemHealthExtended() {
    const checkedAt = new Date();
    const services: Array<{
      service: string;
      status: SystemServiceStatus;
      latencyMs: number | null;
      details?: Record<string, unknown>;
    }> = [];

    const dbStart = Date.now();
    let databaseOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseOk = true;
    } catch {
      databaseOk = false;
    }
    const dbLatency = Date.now() - dbStart;
    services.push({
      service: "database",
      status: databaseOk ? "healthy" : "down",
      latencyMs: dbLatency,
    });
    services.push({
      service: "prisma",
      status: databaseOk ? "healthy" : "down",
      latencyMs: dbLatency,
    });

    const apiStart = Date.now();
    services.push({
      service: "api",
      status: "healthy",
      latencyMs: Date.now() - apiStart,
    });

    const supabaseStart = Date.now();
    const supabase = await getSupabaseReadinessWithDb();
    const supabaseLatency = Date.now() - supabaseStart;
    const supabaseOk = supabase.configured && supabase.database;
    services.push({
      service: "supabase",
      status: supabaseOk ? "healthy" : supabase.configured ? "degraded" : "unknown",
      latencyMs: supabaseLatency,
      details: supabase as unknown as Record<string, unknown>,
    });

    const agents = getAgentReadiness();
    services.push({
      service: "deepseek",
      status:
        env.DEEPSEEK_API_KEY.length > 0
          ? agents.provider === "deepseek" && agents.configured
            ? "healthy"
            : "degraded"
          : "unknown",
      latencyMs: null,
      details: { configured: env.DEEPSEEK_API_KEY.length > 0, active: agents.provider === "deepseek" },
    });

    services.push({
      service: "anthropic",
      status:
        env.ANTHROPIC_API_KEY.length > 0
          ? agents.provider === "anthropic" && agents.configured
            ? "healthy"
            : "degraded"
          : "unknown",
      latencyMs: null,
      details: { configured: env.ANTHROPIC_API_KEY.length > 0, active: agents.provider === "anthropic" },
    });

    services.push({
      service: "e2b",
      status: env.E2B_API_KEY.length > 0 ? "healthy" : "down",
      latencyMs: null,
      details: { template: env.E2B_PREVIEW_TEMPLATE },
    });

    services.push({
      service: "github_export",
      status:
        env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
          ? "healthy"
          : env.JWT_SECRET.length >= 32
            ? "degraded"
            : "down",
      latencyMs: null,
      details: {
        oauthConfigured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
        encryptionKey: Boolean(
          env.GITHUB_TOKEN_ENCRYPTION_KEY || env.JWT_SECRET.length >= 32
        ),
      },
    });

    services.push({
      service: "preview_engine",
      status: previewService.isConfigured() ? "healthy" : "down",
      latencyMs: null,
      details: { template: env.E2B_PREVIEW_TEMPLATE },
    });

    void this.persistSystemMetrics(services, checkedAt);

    return {
      checkedAt: checkedAt.toISOString(),
      services: services.map((s) => ({
        ...s,
        lastCheck: checkedAt.toISOString(),
      })),
      overall:
        services.every((s) => s.status === "healthy")
          ? "healthy"
          : services.some((s) => s.status === "down")
            ? "degraded"
            : "healthy",
    };
  }

  private async persistSystemMetrics(
    services: Array<{ service: string; status: SystemServiceStatus; latencyMs: number | null; details?: Record<string, unknown> }>,
    checkedAt: Date
  ) {
    try {
      await prisma.systemMetric.createMany({
        data: services.map((s) => ({
          service: s.service,
          status: s.status,
          latencyMs: s.latencyMs,
          details: s.details as Prisma.InputJsonValue | undefined,
          checkedAt,
        })),
      });
    } catch (err) {
      console.warn("[admin] Failed to persist system metrics:", err);
    }
  }

  async getGithubStats() {
    const [
      connectedAccounts,
      repositoriesCreated,
      syncSuccesses,
      syncFailures,
      createSuccesses,
      recentConnections,
      recentRepositories,
      recentFailures,
    ] = await Promise.all([
      prisma.githubConnection.count(),
      prisma.githubRepository.count(),
      prisma.githubAuditLog.count({ where: { action: "repository_synced" } }),
      prisma.githubAuditLog.count({ where: { action: "repository_sync_failed" } }),
      prisma.githubAuditLog.count({ where: { action: "repository_created" } }),
      prisma.githubConnection.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          username: true,
          githubUserId: true,
          tokenType: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      prisma.githubRepository.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          repositoryName: true,
          repositoryUrl: true,
          lastCommitSha: true,
          lastSyncedAt: true,
          createdAt: true,
          project: { select: { name: true, slug: true } },
        },
      }),
      prisma.githubAuditLog.findMany({
        where: { action: "repository_sync_failed" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          message: true,
          createdAt: true,
          userId: true,
          projectId: true,
        },
      }),
    ]);

    const totalExports = createSuccesses + syncFailures;
    const exportSuccessRate =
      totalExports > 0
        ? Math.round((createSuccesses / totalExports) * 1000) / 10
        : createSuccesses > 0
          ? 100
          : 0;

    return {
      connectedAccounts,
      repositoriesCreated,
      exportSuccessRate,
      exportFailures: syncFailures,
      syncSuccesses,
      createSuccesses,
      oauthConfigured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      recentConnections: recentConnections.map((c) => ({
        id: c.id,
        username: c.username,
        githubUserId: c.githubUserId,
        tokenType: c.tokenType,
        userEmail: c.user.email,
        connectedAt: c.createdAt.toISOString(),
      })),
      recentRepositories: recentRepositories.map((r) => ({
        id: r.id,
        repositoryName: r.repositoryName,
        repositoryUrl: r.repositoryUrl,
        projectName: r.project.name,
        lastCommitSha: r.lastCommitSha,
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        message: f.message,
        userId: f.userId,
        projectId: f.projectId,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  async checkAdminAccess(userId: string, email: string) {
    const admins = new Set(
      env.ADMIN_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const isAdmin = admins.size > 0 && admins.has(email.toLowerCase());
    return { isAdmin, email, adminConfigured: admins.size > 0 };
  }
}

export const adminPhase2Service = new AdminPhase2Service();
