import type { PlanTier } from "@nebula/database";
import {
  billingService,
  QuotaExceededError,
} from "./billing/billing.service";

export class BuildLimitError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public buildsUsed: number,
    public buildsLimit: number
  ) {
    super(message);
  }
}

export interface SubscriptionSnapshot {
  plan: PlanTier;
  buildsUsed: number;
  buildsLimit: number;
}

/** Pro plan bypasses monthly build limits. */
export function isUnlimitedBuildPlan(plan: PlanTier): boolean {
  return plan === "pro";
}

export function isBuildLimitReached(
  plan: PlanTier,
  buildsUsed: number,
  buildsLimit: number
): boolean {
  if (isUnlimitedBuildPlan(plan)) return false;
  return buildsUsed >= buildsLimit;
}

function quotaToBuildLimitError(err: QuotaExceededError): BuildLimitError {
  const details = err.details ?? {};
  return new BuildLimitError(
    err.code,
    err.message,
    err.status,
    (details.used as number) ?? 0,
    (details.limit as number) ?? 0
  );
}

async function snapshotFromBilling(userId: string): Promise<SubscriptionSnapshot> {
  const snap = await billingService.getSnapshot(userId);
  return {
    plan: snap.plan,
    buildsUsed: snap.usage.aiRequestsToday,
    buildsLimit: snap.limits.dailyAiRequests ?? 999999,
  };
}

/** Delegates to billing module — keeps build.service integration unchanged. */
export class SubscriptionService {
  async getSnapshot(userId: string): Promise<SubscriptionSnapshot> {
    return snapshotFromBilling(userId);
  }

  async assertBuildAllowed(userId: string): Promise<SubscriptionSnapshot> {
    try {
      await billingService.assertAiRequest(userId);
      return snapshotFromBilling(userId);
    } catch (err) {
      if (err instanceof QuotaExceededError) throw quotaToBuildLimitError(err);
      throw err;
    }
  }

  async consumeAiSlot(userId: string, projectId: string): Promise<SubscriptionSnapshot> {
    try {
      await billingService.consumeAiRequest(userId, projectId);
      return snapshotFromBilling(userId);
    } catch (err) {
      if (err instanceof QuotaExceededError) throw quotaToBuildLimitError(err);
      throw err;
    }
  }

  async consumeBuildSlot(
    userId: string,
    projectId?: string
  ): Promise<SubscriptionSnapshot> {
    try {
      await billingService.consumeBuilderRun(userId, projectId ?? "unknown");
      return snapshotFromBilling(userId);
    } catch (err) {
      if (err instanceof QuotaExceededError) throw quotaToBuildLimitError(err);
      throw err;
    }
  }
}

export const subscriptionService = new SubscriptionService();
