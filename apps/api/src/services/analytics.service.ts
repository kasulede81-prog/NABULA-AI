import type { Prisma } from "@nebula/database";
import { prisma } from "../lib/prisma";

export const WorkspaceMetricEvents = {
  FILES_OPENED: "files_opened",
  FILES_SAVED: "files_saved",
  AI_EDITS_REQUESTED: "ai_edits_requested",
  AI_EDITS_APPLIED: "ai_edits_applied",
} as const;

export const PlatformMetricEvents = {
  BUILD_LIMIT_REACHED: "build_limit_reached",
  PREVIEW_STARTED: "preview_started",
  PREVIEW_READY: "preview_ready",
  PREVIEW_STOPPED: "preview_stopped",
  PREVIEW_EXPIRED: "preview_expired",
  PREVIEW_ORPHAN_RECONCILED: "preview_orphan_reconciled",
  PREVIEW_UNHEALTHY: "preview_unhealthy",
} as const;

export type WorkspaceMetricEvent =
  (typeof WorkspaceMetricEvents)[keyof typeof WorkspaceMetricEvents];

export type PlatformMetricEvent =
  (typeof PlatformMetricEvents)[keyof typeof PlatformMetricEvents];

export type AnalyticsEventType = WorkspaceMetricEvent | PlatformMetricEvent;

export interface BuildAnalyticsSummary {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  successRate: number;
  averageBuildDurationMs: number | null;
  averageTokensInput: number;
  averageTokensOutput: number;
  averageEstimatedCostUsd: number | null;
  topFailureCodes: Array<{ code: string; count: number }>;
  topFailurePhases: Array<{ phase: string; count: number }>;
  buildsByProvider: Array<{ provider: string; total: number; successful: number; failed: number }>;
  workspaceMetrics: {
    filesOpened: number;
    filesSaved: number;
    aiEditsRequested: number;
    aiEditsApplied: number;
  };
}

export class AnalyticsService {
  async track(
    eventType: WorkspaceMetricEvent,
    userId?: string,
    projectId?: string,
    metadata?: Record<string, unknown>
  ) {
    await this.trackPlatform(eventType, userId, projectId, metadata);
  }

  async trackPlatform(
    eventType: AnalyticsEventType,
    userId?: string,
    projectId?: string,
    metadata?: Record<string, unknown>
  ) {
    await prisma.analyticsEvent.create({
      data: {
        eventType,
        userId: userId ?? null,
        projectId: projectId ?? null,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async getBuildAnalytics(): Promise<BuildAnalyticsSummary> {
    const builderRuns = await prisma.agentRun.findMany({
      where: { agentType: "builder", status: { in: ["completed", "failed"] } },
      select: {
        status: true,
        tokensInput: true,
        tokensOutput: true,
        buildDurationMs: true,
        estimatedCostUsd: true,
        errorCode: true,
        failurePhase: true,
        llmProvider: true,
      },
    });

    const totalBuilds = builderRuns.length;
    const successfulBuilds = builderRuns.filter((r) => r.status === "completed").length;
    const failedBuilds = builderRuns.filter((r) => r.status === "failed").length;
    const successRate = totalBuilds > 0 ? successfulBuilds / totalBuilds : 0;

    const durations = builderRuns
      .map((r) => r.buildDurationMs)
      .filter((d): d is number => d != null);
    const averageBuildDurationMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

    const averageTokensInput =
      totalBuilds > 0
        ? builderRuns.reduce((s, r) => s + r.tokensInput, 0) / totalBuilds
        : 0;
    const averageTokensOutput =
      totalBuilds > 0
        ? builderRuns.reduce((s, r) => s + r.tokensOutput, 0) / totalBuilds
        : 0;

    const costs = builderRuns
      .map((r) => r.estimatedCostUsd)
      .filter((c): c is number => c != null);
    const averageEstimatedCostUsd =
      costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null;

    const codeCounts = new Map<string, number>();
    const phaseCounts = new Map<string, number>();
    const providerMap = new Map<
      string,
      { total: number; successful: number; failed: number }
    >();

    for (const run of builderRuns) {
      const provider = run.llmProvider ?? "unknown";
      const entry = providerMap.get(provider) ?? {
        total: 0,
        successful: 0,
        failed: 0,
      };
      entry.total += 1;
      if (run.status === "completed") entry.successful += 1;
      else entry.failed += 1;
      providerMap.set(provider, entry);

      if (run.status === "failed") {
        const code = run.errorCode ?? "UNKNOWN";
        codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
        const phase = run.failurePhase ?? "unknown";
        phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
      }
    }

    const topFailureCodes = [...codeCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topFailurePhases = [...phaseCounts.entries()]
      .map(([phase, count]) => ({ phase, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const buildsByProvider = [...providerMap.entries()]
      .map(([provider, stats]) => ({ provider, ...stats }))
      .sort((a, b) => b.total - a.total);

    const workspaceCounts = await prisma.analyticsEvent.groupBy({
      by: ["eventType"],
      _count: { eventType: true },
      where: {
        eventType: {
          in: Object.values(WorkspaceMetricEvents),
        },
      },
    });

    const countMap = new Map(
      workspaceCounts.map((r) => [r.eventType, r._count.eventType])
    );

    return {
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      successRate,
      averageBuildDurationMs,
      averageTokensInput,
      averageTokensOutput,
      averageEstimatedCostUsd,
      topFailureCodes,
      topFailurePhases,
      buildsByProvider,
      workspaceMetrics: {
        filesOpened: countMap.get(WorkspaceMetricEvents.FILES_OPENED) ?? 0,
        filesSaved: countMap.get(WorkspaceMetricEvents.FILES_SAVED) ?? 0,
        aiEditsRequested: countMap.get(WorkspaceMetricEvents.AI_EDITS_REQUESTED) ?? 0,
        aiEditsApplied: countMap.get(WorkspaceMetricEvents.AI_EDITS_APPLIED) ?? 0,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
