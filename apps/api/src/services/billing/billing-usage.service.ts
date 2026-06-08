import type { Prisma, UsageEventType } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import {
  CREDIT_COSTS,
  PLAN_LIMITS,
  startOfToday,
  startOfMonth,
  isUnlimitedPlan,
} from "./billing-plans";
import { billingCreditsService } from "./billing-credits.service";
import { billingAuditService } from "./billing-audit.service";

const AI_EVENT_TYPES: UsageEventType[] = ["ai_generation", "builder_run"];

export class QuotaExceededError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export class BillingUsageService {
  async countProjectsThisMonth(userId: string): Promise<number> {
    return prisma.project.count({
      where: { userId, createdAt: { gte: startOfMonth() } },
    });
  }

  async countUsageToday(userId: string, eventTypes: UsageEventType[]): Promise<number> {
    return prisma.usageEvent.count({
      where: {
        userId,
        eventType: { in: eventTypes },
        createdAt: { gte: startOfToday() },
      },
    });
  }

  async recordUsage(params: {
    userId: string;
    eventType: UsageEventType;
    projectId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const sub = await prisma.subscription.findUnique({
      where: { userId: params.userId },
    });
    if (!sub) {
      throw new QuotaExceededError(
        "NO_SUBSCRIPTION",
        "No subscription found",
        403
      );
    }

    await billingCreditsService.ensureMonthlyGrant(
      params.userId,
      sub.plan,
      sub.renewsAt
    );

    const refreshed = await prisma.subscription.findUnique({
      where: { userId: params.userId },
    });
    if (!refreshed) {
      throw new QuotaExceededError("NO_SUBSCRIPTION", "No subscription found", 403);
    }

    const cost = CREDIT_COSTS[params.eventType];

    if (params.eventType !== "project_created") {
      this.assertQuota(refreshed.plan, refreshed.creditsBalance, params.eventType, {
        projectsThisMonth: await this.countProjectsThisMonth(params.userId),
        aiToday: await this.countUsageToday(params.userId, AI_EVENT_TYPES),
        previewsToday: await this.countUsageToday(params.userId, ["preview_launch"]),
        cost,
      });
    }

    const creditsAfter = await billingCreditsService.deductCredits(
      params.userId,
      cost,
      refreshed.plan,
      { eventType: params.eventType, projectId: params.projectId }
    );

    await prisma.usageEvent.create({
      data: {
        userId: params.userId,
        projectId: params.projectId,
        eventType: params.eventType,
        creditsConsumed: cost,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    if (params.eventType === "builder_run" || params.eventType === "ai_generation") {
      await prisma.subscription.update({
        where: { userId: params.userId },
        data: { buildsUsedThisPeriod: { increment: 1 } },
      });
    }

    await billingAuditService.log({
      userId: params.userId,
      action: "credits_consumed",
      metadata: {
        eventType: params.eventType,
        creditsConsumed: cost,
        creditsAfter,
        projectId: params.projectId,
      },
    });

    return { creditsConsumed: cost, creditsRemaining: creditsAfter };
  }

  assertQuota(
    plan: import("@nebula/database").PlanTier,
    creditsBalance: number,
    eventType: UsageEventType,
    counts: {
      projectsThisMonth: number;
      aiToday: number;
      previewsToday: number;
      cost: number;
    }
  ) {
    const limits = PLAN_LIMITS[plan];

    if (eventType === "project_created") {
      if (
        limits.monthlyProjects !== null &&
        counts.projectsThisMonth >= limits.monthlyProjects
      ) {
        throw new QuotaExceededError(
          "PROJECT_LIMIT_REACHED",
          `Free plan allows ${limits.monthlyProjects} projects per month.`,
          429,
          { limit: limits.monthlyProjects, used: counts.projectsThisMonth }
        );
      }
      return;
    }

    if (AI_EVENT_TYPES.includes(eventType)) {
      if (
        limits.dailyAiRequests !== null &&
        counts.aiToday >= limits.dailyAiRequests
      ) {
        throw new QuotaExceededError(
          "AI_LIMIT_REACHED",
          `Daily AI request limit reached (${limits.dailyAiRequests}/day).`,
          429,
          { limit: limits.dailyAiRequests, used: counts.aiToday }
        );
      }
    }

    if (eventType === "preview_launch") {
      if (
        limits.dailyPreviews !== null &&
        counts.previewsToday >= limits.dailyPreviews
      ) {
        throw new QuotaExceededError(
          "PREVIEW_LIMIT_REACHED",
          `Daily preview limit reached (${limits.dailyPreviews}/day).`,
          429,
          { limit: limits.dailyPreviews, used: counts.previewsToday }
        );
      }
    }

    if (!isUnlimitedPlan(plan) && counts.cost > 0 && creditsBalance < counts.cost) {
      throw new QuotaExceededError(
        "INSUFFICIENT_CREDITS",
        "Insufficient credits for this action.",
        429,
        { required: counts.cost, balance: creditsBalance }
      );
    }
  }

  async checkQuota(
    userId: string,
    eventType: UsageEventType
  ): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      throw new QuotaExceededError("NO_SUBSCRIPTION", "No subscription found", 403);
    }

    await billingCreditsService.ensureMonthlyGrant(userId, sub.plan, sub.renewsAt);

    const refreshed = await prisma.subscription.findUnique({ where: { userId } });
    if (!refreshed) return;

    const cost = CREDIT_COSTS[eventType];
    this.assertQuota(refreshed.plan, refreshed.creditsBalance, eventType, {
      projectsThisMonth: await this.countProjectsThisMonth(userId),
      aiToday: await this.countUsageToday(userId, AI_EVENT_TYPES),
      previewsToday: await this.countUsageToday(userId, ["preview_launch"]),
      cost,
    });
  }
}

export const billingUsageService = new BillingUsageService();
