import type { PlanTier, UsageEventType } from "@nebula/database";

export interface PlanLimits {
  monthlyProjects: number | null;
  dailyAiRequests: number | null;
  dailyPreviews: number | null;
  monthlyCredits: number | null;
  priorityQueue: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    monthlyProjects: 5,
    dailyAiRequests: 20,
    dailyPreviews: 2,
    monthlyCredits: 100,
    priorityQueue: false,
  },
  starter: {
    monthlyProjects: 15,
    dailyAiRequests: 50,
    dailyPreviews: 5,
    monthlyCredits: 300,
    priorityQueue: false,
  },
  pro: {
    monthlyProjects: null,
    dailyAiRequests: null,
    dailyPreviews: 20,
    monthlyCredits: null,
    priorityQueue: true,
  },
};

export const CREDIT_COSTS: Record<UsageEventType, number> = {
  project_created: 0,
  ai_generation: 1,
  builder_run: 1,
  preview_launch: 5,
  github_export: 3,
};

export const PRO_MONTHLY_PRICE_USD = 29;

export function isUnlimitedPlan(plan: PlanTier): boolean {
  return plan === "pro";
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
