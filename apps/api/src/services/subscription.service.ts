import { prisma } from "../lib/prisma";

type PlanTier = "free" | "starter" | "pro";

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

export class SubscriptionService {
  private async maybeResetPeriod(
    userId: string,
    currentPeriodEnd: Date | null,
    buildsUsedThisPeriod: number
  ): Promise<number> {
    if (!currentPeriodEnd || currentPeriodEnd >= new Date()) {
      return buildsUsedThisPeriod;
    }

    const nextPeriodEnd = new Date(currentPeriodEnd);
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    await prisma.subscription.update({
      where: { userId },
      data: {
        buildsUsedThisPeriod: 0,
        currentPeriodEnd: nextPeriodEnd,
      },
    });

    return 0;
  }

  async getSnapshot(userId: string): Promise<SubscriptionSnapshot> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      return { plan: "free", buildsUsed: 0, buildsLimit: 3 };
    }

    const buildsUsed = await this.maybeResetPeriod(
      userId,
      sub.currentPeriodEnd,
      sub.buildsUsedThisPeriod
    );

    return {
      plan: sub.plan,
      buildsUsed,
      buildsLimit: sub.buildsLimit,
    };
  }

  /** Check whether clarifier or builder may start (no increment). */
  async assertBuildAllowed(userId: string): Promise<SubscriptionSnapshot> {
    const snapshot = await this.getSnapshot(userId);
    if (isBuildLimitReached(snapshot.plan, snapshot.buildsUsed, snapshot.buildsLimit)) {
      throw new BuildLimitError(
        "BUILD_LIMIT_REACHED",
        "You have reached your monthly build limit.",
        429,
        snapshot.buildsUsed,
        snapshot.buildsLimit
      );
    }
    return snapshot;
  }

  /**
   * Atomically reserve a build slot when the builder starts.
   * Pro users increment for analytics but never block.
   */
  async consumeBuildSlot(userId: string): Promise<SubscriptionSnapshot> {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { userId } });
      if (!sub) {
        throw new BuildLimitError(
          "BUILD_LIMIT_REACHED",
          "You have reached your monthly build limit.",
          429,
          0,
          3
        );
      }

      let buildsUsed = sub.buildsUsedThisPeriod;
      if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
        const nextPeriodEnd = new Date(sub.currentPeriodEnd);
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
        buildsUsed = 0;
        await tx.subscription.update({
          where: { userId },
          data: {
            buildsUsedThisPeriod: 0,
            currentPeriodEnd: nextPeriodEnd,
          },
        });
      }

      if (
        !isUnlimitedBuildPlan(sub.plan) &&
        buildsUsed >= sub.buildsLimit
      ) {
        throw new BuildLimitError(
          "BUILD_LIMIT_REACHED",
          "You have reached your monthly build limit.",
          429,
          buildsUsed,
          sub.buildsLimit
        );
      }

      const updated = await tx.subscription.update({
        where: { userId },
        data: { buildsUsedThisPeriod: { increment: 1 } },
      });

      return {
        plan: updated.plan,
        buildsUsed: updated.buildsUsedThisPeriod,
        buildsLimit: updated.buildsLimit,
      };
    });
  }
}

export const subscriptionService = new SubscriptionService();
