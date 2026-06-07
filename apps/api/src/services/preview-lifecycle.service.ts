import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { previewService } from "./preview.service";
import { analyticsService, PlatformMetricEvents } from "./analytics.service";

const STALE_STARTING_MS = 10 * 60 * 1000;

export class PreviewLifecycleService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.intervalId) return;

    void this.runCycle("startup").catch((err) => {
      console.error("[preview-lifecycle] Startup reconciliation failed:", err);
    });

    this.intervalId = setInterval(() => {
      void this.runCycle("interval").catch((err) => {
        console.error("[preview-lifecycle] Reconciliation failed:", err);
      });
    }, env.PREVIEW_RECONCILE_INTERVAL_MS);

    console.log(
      `[preview-lifecycle] Started (interval ${env.PREVIEW_RECONCILE_INTERVAL_MS}ms)`
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runCycle(trigger: "startup" | "interval"): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileExpiredPreviews();
      if (trigger === "startup") {
        await this.reconcileOrphanedPreviews(true);
      } else {
        await this.reconcileOrphanedPreviews(false);
      }
      await this.monitorPreviewHealth();
    } finally {
      this.running = false;
    }
  }

  async reconcileExpiredPreviews(): Promise<number> {
    const now = new Date();
    const expired = await prisma.preview.findMany({
      where: {
        status: { in: ["starting", "ready"] },
        expiresAt: { lt: now },
      },
      include: { project: { select: { userId: true } } },
    });

    for (const preview of expired) {
      await previewService.forceStop(preview.projectId, preview.project.userId, {
        reason: "expired",
        sandboxId: preview.sandboxId,
        startedAt: preview.startedAt,
      });
    }

    if (expired.length > 0) {
      console.log(`[preview-lifecycle] Expired ${expired.length} preview(s)`);
    }
    return expired.length;
  }

  async reconcileOrphanedPreviews(onStartup: boolean): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_STARTING_MS);

    const orphans = await prisma.preview.findMany({
      where: { status: "starting" },
      include: { project: { select: { userId: true } } },
    });

    let cleaned = 0;
    for (const preview of orphans) {
      if (!onStartup) {
        if (previewService.isProvisioning(preview.projectId)) continue;
        if (preview.updatedAt >= staleBefore) continue;
      }

      await previewService.forceStop(preview.projectId, preview.project.userId, {
        reason: "orphan",
        sandboxId: preview.sandboxId,
        startedAt: preview.startedAt,
      });
      cleaned += 1;

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_ORPHAN_RECONCILED,
        preview.project.userId,
        preview.projectId,
        { sandboxId: preview.sandboxId, status: preview.status }
      );
    }

    if (cleaned > 0) {
      console.log(`[preview-lifecycle] Reconciled ${cleaned} orphaned preview(s)`);
    }
    return cleaned;
  }

  async monitorPreviewHealth(): Promise<number> {
    const active = await prisma.preview.findMany({
      where: { status: "ready", url: { not: null } },
      include: { project: { select: { userId: true } } },
    });

    const healthGraceMs = 2 * 60 * 1000;
    const healthEligibleBefore = new Date(Date.now() - healthGraceMs);

    let unhealthy = 0;
    for (const preview of active) {
      if (!preview.url) continue;
      if (preview.startedAt && preview.startedAt > healthEligibleBefore) continue;

      const healthy = await this.probePreviewUrl(preview.url);
      if (healthy) continue;

      unhealthy += 1;
      await previewService.forceStop(preview.projectId, preview.project.userId, {
        reason: "unhealthy",
        sandboxId: preview.sandboxId,
        startedAt: preview.startedAt,
      });

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_UNHEALTHY,
        preview.project.userId,
        preview.projectId,
        { previewUrl: preview.url, sandboxId: preview.sandboxId }
      );
    }

    return unhealthy;
  }

  private async probePreviewUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok || res.status === 405;
    } catch {
      return false;
    }
  }
}

export const previewLifecycleService = new PreviewLifecycleService();
