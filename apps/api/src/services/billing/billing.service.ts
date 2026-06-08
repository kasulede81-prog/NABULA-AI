import type { PlanTier, UsageEventType } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import {
  PLAN_LIMITS,
  PRO_MONTHLY_PRICE_USD,
  startOfToday,
  startOfMonth,
  isUnlimitedPlan,
} from "./billing-plans";
import { billingCreditsService } from "./billing-credits.service";
import { billingUsageService } from "./billing-usage.service";

export { QuotaExceededError } from "./billing-usage.service";

export interface BillingSnapshot {
  plan: PlanTier;
  status: string;
  creditsRemaining: number;
  renewsAt: string | null;
  priorityQueue: boolean;
  limits: {
    monthlyProjects: number | null;
    dailyAiRequests: number | null;
    dailyPreviews: number | null;
    monthlyCredits: number | null;
  };
  usage: {
    projectsThisMonth: number;
    aiRequestsToday: number;
    previewsToday: number;
    buildsUsedThisPeriod: number;
  };
}

export class BillingService {
  async initializeFreePlan(userId: string) {
    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: "free",
        status: "active",
        creditsBalance: PLAN_LIMITS.free.monthlyCredits ?? 100,
        buildsLimit: PLAN_LIMITS.free.dailyAiRequests ?? 20,
        renewsAt,
      },
      update: {},
    });

    await prisma.creditLedger.create({
      data: {
        userId,
        type: "monthly_grant",
        amount: PLAN_LIMITS.free.monthlyCredits ?? 100,
        balanceAfter: PLAN_LIMITS.free.monthlyCredits ?? 100,
        metadata: { reason: "initial_grant" },
      },
    });
  }

  async getSnapshot(userId: string): Promise<BillingSnapshot> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      return {
        plan: "free",
        status: "active",
        creditsRemaining: 0,
        renewsAt: null,
        priorityQueue: false,
        limits: PLAN_LIMITS.free,
        usage: {
          projectsThisMonth: 0,
          aiRequestsToday: 0,
          previewsToday: 0,
          buildsUsedThisPeriod: 0,
        },
      };
    }

    await billingCreditsService.ensureMonthlyGrant(userId, sub.plan, sub.renewsAt);
    const refreshed = await prisma.subscription.findUnique({ where: { userId } });
    const plan = refreshed?.plan ?? sub.plan;
    const limits = PLAN_LIMITS[plan];

    const [projectsThisMonth, aiToday, previewsToday] = await Promise.all([
      billingUsageService.countProjectsThisMonth(userId),
      billingUsageService.countUsageToday(userId, [
        "ai_generation",
        "builder_run",
      ]),
      billingUsageService.countUsageToday(userId, ["preview_launch"]),
    ]);

    return {
      plan,
      status: refreshed?.status ?? sub.status,
      creditsRemaining: isUnlimitedPlan(plan)
        ? 999999
        : (refreshed?.creditsBalance ?? sub.creditsBalance),
      renewsAt: refreshed?.renewsAt?.toISOString() ?? sub.renewsAt?.toISOString() ?? null,
      priorityQueue: limits.priorityQueue,
      limits: {
        monthlyProjects: limits.monthlyProjects,
        dailyAiRequests: limits.dailyAiRequests,
        dailyPreviews: limits.dailyPreviews,
        monthlyCredits: limits.monthlyCredits,
      },
      usage: {
        projectsThisMonth,
        aiRequestsToday: aiToday,
        previewsToday,
        buildsUsedThisPeriod: refreshed?.buildsUsedThisPeriod ?? sub.buildsUsedThisPeriod,
      },
    };
  }

  async assertProjectCreation(userId: string) {
    await billingUsageService.checkQuota(userId, "project_created");
  }

  async assertAiRequest(userId: string) {
    await billingUsageService.checkQuota(userId, "ai_generation");
  }

  async assertBuilderRun(userId: string) {
    await billingUsageService.checkQuota(userId, "builder_run");
  }

  async assertPreviewLaunch(userId: string) {
    await billingUsageService.checkQuota(userId, "preview_launch");
  }

  async assertGithubExport(userId: string) {
    await billingUsageService.checkQuota(userId, "github_export");
  }

  async consumeProjectCreation(userId: string, projectId: string) {
    return billingUsageService.recordUsage({
      userId,
      eventType: "project_created",
      projectId,
    });
  }

  async consumeAiRequest(userId: string, projectId: string) {
    return billingUsageService.recordUsage({
      userId,
      eventType: "ai_generation",
      projectId,
    });
  }

  async consumeBuilderRun(userId: string, projectId: string) {
    return billingUsageService.recordUsage({
      userId,
      eventType: "builder_run",
      projectId,
    });
  }

  async consumePreviewLaunch(userId: string, projectId: string) {
    return billingUsageService.recordUsage({
      userId,
      eventType: "preview_launch",
      projectId,
    });
  }

  async consumeGithubExport(userId: string, projectId: string) {
    return billingUsageService.recordUsage({
      userId,
      eventType: "github_export",
      projectId,
    });
  }

  async getRecentUsage(userId: string, limit = 20) {
    const events = await prisma.usageEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        creditsConsumed: true,
        projectId: true,
        createdAt: true,
      },
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      creditsConsumed: e.creditsConsumed,
      projectId: e.projectId,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async getAdminStats() {
    const monthStart = startOfMonth();
    const today = startOfToday();

    const [
      activeSubscriptions,
      proSubscriptions,
      freeSubscriptions,
      totalCreditsConsumed,
      usageThisMonth,
      usageToday,
      recentLedger,
      quotaExceeded,
    ] = await Promise.all([
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { plan: "pro", status: "active" } }),
      prisma.subscription.count({ where: { plan: "free", status: "active" } }),
      prisma.usageEvent.aggregate({
        _sum: { creditsConsumed: true },
      }),
      prisma.usageEvent.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.usageEvent.count({ where: { createdAt: { gte: today } } }),
      prisma.creditLedger.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          userId: true,
          type: true,
          amount: true,
          balanceAfter: true,
          createdAt: true,
        },
      }),
      prisma.billingAuditLog.count({ where: { action: "quota_exceeded" } }),
    ]);

    const estimatedRevenueUsd =
      Math.round(proSubscriptions * PRO_MONTHLY_PRICE_USD * 100) / 100;

    const usageByType = await prisma.usageEvent.groupBy({
      by: ["eventType"],
      _count: { id: true },
      _sum: { creditsConsumed: true },
      where: { createdAt: { gte: monthStart } },
    });

    return {
      estimatedRevenueUsd,
      activeSubscriptions,
      proSubscriptions,
      freeSubscriptions,
      totalCreditsConsumed: totalCreditsConsumed._sum.creditsConsumed ?? 0,
      usageThisMonth,
      usageToday,
      quotaExceededEvents: quotaExceeded,
      usageByType: usageByType.map((row) => ({
        eventType: row.eventType,
        count: row._count.id,
        creditsConsumed: row._sum.creditsConsumed ?? 0,
      })),
      recentLedger: recentLedger.map((e) => ({
        id: e.id,
        userId: e.userId,
        type: e.type,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}

export const billingService = new BillingService();
