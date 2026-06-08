import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";
import { eventService } from "./event.service";
import { analyticsService, PlatformMetricEvents } from "./analytics.service";
import {
  SseEvents,
  validateBuildReady,
  PreviewPhases,
  PreviewErrorCodes,
  type AppSpec,
  type PreviewPhase,
  type PreviewFramework,
  type PreviewPackageManager,
  type PreviewStatusResponse,
  type PreviewLogEntry,
} from "@nebula/shared";
import { previewRunner } from "./preview/preview-runner";
import { previewLogStore } from "./preview/preview-log-store";

type PreviewStatus = "starting" | "ready" | "stopped" | "error";

export class PreviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export interface PreviewRecord {
  id: string;
  projectId: string;
  status: PreviewStatus;
  phase: PreviewPhase;
  previewUrl: string | null;
  detectedPort: number | null;
  framework: PreviewFramework | null;
  packageManager: PreviewPackageManager | null;
  errorCode: string | null;
  errorMessage: string | null;
  sandboxId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  startedAt: Date | null;
  estimatedCostUsd: number | null;
}

function toPreviewRecord(row: {
  id: string;
  projectId: string;
  status: PreviewStatus;
  phase?: PreviewPhase | null;
  url: string | null;
  detectedPort?: number | null;
  framework?: string | null;
  packageManager?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sandboxId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  startedAt?: Date | null;
  estimatedCostUsd?: number | null;
}): PreviewRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    phase: (row.phase as PreviewPhase) ?? PreviewPhases.PREPARING_SANDBOX,
    previewUrl: row.url,
    detectedPort: row.detectedPort ?? null,
    framework: (row.framework as PreviewFramework) ?? null,
    packageManager: (row.packageManager as PreviewPackageManager) ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    sandboxId: row.sandboxId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    startedAt: row.startedAt ?? null,
    estimatedCostUsd: row.estimatedCostUsd ?? null,
  };
}

function toStatusResponse(record: PreviewRecord): PreviewStatusResponse {
  return {
    id: record.id,
    projectId: record.projectId,
    status: record.status,
    phase: record.phase,
    previewUrl: record.previewUrl,
    detectedPort: record.detectedPort,
    framework: record.framework,
    packageManager: record.packageManager,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    sandboxId: record.sandboxId,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    startedAt: record.startedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function estimatePreviewCostUsd(durationMs: number): number {
  const hours = durationMs / (60 * 60 * 1000);
  return Math.round(hours * env.PREVIEW_COST_USD_PER_HOUR * 1_000_000) / 1_000_000;
}

export class PreviewService {
  private running = new Set<string>();

  isConfigured(): boolean {
    return env.E2B_API_KEY.length > 0;
  }

  isProvisioning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  async get(projectId: string, userId: string): Promise<PreviewRecord | null> {
    await projectService.get(projectId, userId);
    const row = await prisma.preview.findUnique({ where: { projectId } });
    return row ? toPreviewRecord(row) : null;
  }

  async getById(previewId: string, userId: string): Promise<PreviewRecord | null> {
    const row = await prisma.preview.findUnique({
      where: { id: previewId },
    });
    if (!row) return null;
    try {
      await projectService.get(row.projectId, userId);
    } catch {
      return null;
    }
    return toPreviewRecord(row);
  }

  async getStatus(previewId: string, userId: string): Promise<PreviewStatusResponse | null> {
    const record = await this.getById(previewId, userId);
    return record ? toStatusResponse(record) : null;
  }

  async getLogs(
    previewId: string,
    userId: string,
    since?: string
  ): Promise<PreviewLogEntry[]> {
    const record = await this.getById(previewId, userId);
    if (!record) return [];

    const rows = await previewLogStore.list(
      previewId,
      since ? new Date(since) : undefined
    );

    return rows.map((row) => ({
      id: row.id,
      previewId: row.previewId,
      level: row.level as PreviewLogEntry["level"],
      source: row.source as PreviewLogEntry["source"],
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async countActiveForUser(userId: string, excludeProjectId?: string): Promise<number> {
    return prisma.preview.count({
      where: {
        status: { in: ["starting", "ready"] },
        project: { userId },
        ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
      },
    });
  }

  async validateReadyForPreview(projectId: string, userId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new PreviewError(
        PreviewErrorCodes.E2B_NOT_CONFIGURED,
        "E2B_API_KEY is not configured. Set it in your API environment to enable live previews.",
        503
      );
    }

    const project = await projectService.get(projectId, userId);

    if (project.status !== "ready") {
      throw new PreviewError(
        PreviewErrorCodes.PROJECT_NOT_READY,
        "Preview can only be created when project status is ready",
        422
      );
    }

    if (!project.specJson) {
      throw new PreviewError("NO_SPEC", "Project has no specification", 422);
    }

    const active = await this.countActiveForUser(userId, projectId);
    if (active >= env.PREVIEW_MAX_PER_USER) {
      throw new PreviewError(
        "PREVIEW_CONCURRENCY_LIMIT",
        `You can have at most ${env.PREVIEW_MAX_PER_USER} active previews`,
        429
      );
    }

    const paths = (await vfsService.snapshot(projectId, userId)).map((f) => f.path);
    const ready = validateBuildReady({
      paths,
      spec: project.specJson as AppSpec,
    });

    if (!ready.ok) {
      throw new PreviewError(
        "PREVIEW_VALIDATION_FAILED",
        `Missing required files: ${ready.errors.join(", ")}`,
        422
      );
    }
  }

  scheduleStart(projectId: string, userId: string): void {
    if (this.running.has(projectId)) {
      throw new PreviewError(
        "PREVIEW_IN_PROGRESS",
        "Preview provisioning is already in progress",
        409
      );
    }

    void this.start(projectId, userId).catch((err) => {
      console.error(`[preview] Failed for ${projectId}:`, err);
    });
  }

  async create(projectId: string, userId: string): Promise<{ previewId: string; status: string }> {
    await this.validateReadyForPreview(projectId, userId);

    if (this.running.has(projectId)) {
      throw new PreviewError(
        "PREVIEW_IN_PROGRESS",
        "Preview provisioning is already in progress",
        409
      );
    }

    const existing = await prisma.preview.findUnique({ where: { projectId } });
    if (existing?.status === "starting") {
      throw new PreviewError(
        "PREVIEW_IN_PROGRESS",
        "Preview provisioning is already in progress",
        409
      );
    }

    this.scheduleStart(projectId, userId);

    const preview = await prisma.preview.findUnique({ where: { projectId } });
    return {
      previewId: preview?.id ?? "",
      status: "accepted",
    };
  }

  async start(projectId: string, userId: string): Promise<PreviewRecord> {
    if (!this.isConfigured()) {
      throw new PreviewError(
        PreviewErrorCodes.E2B_NOT_CONFIGURED,
        "E2B_API_KEY is not configured",
        503
      );
    }

    if (this.running.has(projectId)) {
      throw new PreviewError(
        "PREVIEW_IN_PROGRESS",
        "Preview provisioning is already in progress",
        409
      );
    }

    this.running.add(projectId);

    let previewId = "";

    try {
      await this.validateReadyForPreview(projectId, userId);

      const existing = await prisma.preview.findUnique({ where: { projectId } });
      if (existing?.sandboxId) {
        await this.killSandbox(existing.sandboxId);
      }

      const expiresAt = new Date(Date.now() + env.PREVIEW_TTL_MS);
      const provisionStartedAt = new Date();

      const preview = await prisma.preview.upsert({
        where: { projectId },
        create: {
          projectId,
          status: "starting",
          phase: PreviewPhases.PREPARING_SANDBOX,
          url: null,
          sandboxId: null,
          detectedPort: null,
          framework: null,
          packageManager: null,
          errorCode: null,
          errorMessage: null,
          expiresAt,
          startedAt: null,
          estimatedCostUsd: null,
        },
        update: {
          status: "starting",
          phase: PreviewPhases.PREPARING_SANDBOX,
          url: null,
          sandboxId: null,
          detectedPort: null,
          framework: null,
          packageManager: null,
          errorCode: null,
          errorMessage: null,
          expiresAt,
          startedAt: null,
          estimatedCostUsd: null,
        },
      });

      previewId = preview.id;

      eventService.publish(projectId, SseEvents.PREVIEW_STARTED, {
        previewId: preview.id,
        message: "Preparing isolated sandbox...",
        phase: PreviewPhases.PREPARING_SANDBOX,
        expiresAt: expiresAt.toISOString(),
      });

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_STARTED,
        userId,
        projectId,
        { previewId: preview.id, expiresAt: expiresAt.toISOString() }
      );

      const files = await vfsService.snapshot(projectId, userId);

      const result = await previewRunner.run({
        projectId,
        userId,
        previewId: preview.id,
        files: files.map((f) => ({ path: f.path, content: f.content })),
      });

      const readyAt = new Date();

      const ready = await prisma.preview.update({
        where: { projectId },
        data: {
          status: "ready",
          phase: PreviewPhases.PREVIEW_READY,
          url: result.previewUrl,
          sandboxId: result.sandboxId,
          detectedPort: result.detectedPort,
          framework: result.framework,
          packageManager: result.packageManager,
          expiresAt,
          startedAt: readyAt,
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { previewUrl: result.previewUrl },
      });

      eventService.publish(projectId, SseEvents.PREVIEW_READY, {
        previewId: ready.id,
        previewUrl: result.previewUrl,
        sandboxId: result.sandboxId,
        detectedPort: result.detectedPort,
        phase: PreviewPhases.PREVIEW_READY,
        expiresAt: expiresAt.toISOString(),
      });

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_READY,
        userId,
        projectId,
        {
          previewId: ready.id,
          sandboxId: result.sandboxId,
          provisionDurationMs: readyAt.getTime() - provisionStartedAt.getTime(),
        }
      );

      return toPreviewRecord(ready);
    } catch (err) {
      const failedRow = previewId
        ? await prisma.preview.findUnique({ where: { id: previewId }, select: { phase: true } })
        : null;
      const classified = previewRunner.wrapFailure(
        err,
        (failedRow?.phase as PreviewPhase) ?? PreviewPhases.PREPARING_SANDBOX
      );
      const message = classified.message;

      await prisma.preview.upsert({
        where: { projectId },
        create: {
          projectId,
          status: "error",
          phase: PreviewPhases.FAILED,
          url: null,
          sandboxId: null,
          errorCode: classified.code,
          errorMessage: message,
        },
        update: {
          status: "error",
          phase: PreviewPhases.FAILED,
          url: null,
          errorCode: classified.code,
          errorMessage: message,
        },
      });

      if (previewId) {
        await previewLogStore.append({
          projectId,
          previewId,
          level: "error",
          source: "system",
          message,
        });
      }

      eventService.publish(projectId, SseEvents.PREVIEW_FAILED, {
        previewId,
        message,
        code: classified.code,
        phase: PreviewPhases.FAILED,
      });

      eventService.publish(projectId, SseEvents.PREVIEW_PHASE, {
        previewId,
        phase: PreviewPhases.FAILED,
        errorCode: classified.code,
        errorMessage: message,
      });

      throw new PreviewError(classified.code, message, classified.status);
    } finally {
      this.running.delete(projectId);
    }
  }

  async stop(projectId: string, userId: string): Promise<void> {
    await projectService.get(projectId, userId);

    const preview = await prisma.preview.findUnique({ where: { projectId } });
    if (!preview) return;

    await this.forceStop(projectId, userId, {
      reason: "manual",
      sandboxId: preview.sandboxId,
      startedAt: preview.startedAt,
    });
  }

  async stopById(previewId: string, userId: string): Promise<void> {
    const preview = await prisma.preview.findUnique({
      where: { id: previewId },
    });

    if (!preview) {
      throw new PreviewError("PREVIEW_NOT_FOUND", "Preview not found", 404);
    }

    await projectService.get(preview.projectId, userId);

    await this.forceStop(preview.projectId, userId, {
      reason: "manual",
      sandboxId: preview.sandboxId,
      startedAt: preview.startedAt,
    });
  }

  async forceStop(
    projectId: string,
    userId: string,
    opts: {
      reason: "manual" | "expired" | "orphan" | "unhealthy";
      sandboxId: string | null;
      startedAt: Date | null;
    }
  ): Promise<void> {
    const preview = await prisma.preview.findUnique({ where: { projectId } });
    if (!preview) return;

    const sandboxId = opts.sandboxId ?? preview.sandboxId;
    if (sandboxId) {
      await this.killSandbox(sandboxId);
    }

    const endedAt = new Date();
    const startedAt = opts.startedAt ?? preview.startedAt ?? preview.createdAt;
    const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    const estimatedCostUsd = estimatePreviewCostUsd(durationMs);

    await prisma.preview.update({
      where: { projectId },
      data: {
        status: "stopped",
        url: null,
        sandboxId: null,
        estimatedCostUsd,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { previewUrl: null },
    });

    const eventType =
      opts.reason === "expired" ? SseEvents.PREVIEW_EXPIRED : SseEvents.PREVIEW_DELETED;

    eventService.publish(projectId, eventType, {
      previewId: preview.id,
      message:
        opts.reason === "expired"
          ? "Preview expired and was stopped"
          : opts.reason === "orphan"
            ? "Orphaned preview sandbox was cleaned up"
            : opts.reason === "unhealthy"
              ? "Preview became unhealthy and was stopped"
              : "Preview sandbox stopped",
      reason: opts.reason,
      durationMs,
      estimatedCostUsd,
    });

    const metricEvent =
      opts.reason === "expired"
        ? PlatformMetricEvents.PREVIEW_EXPIRED
        : PlatformMetricEvents.PREVIEW_STOPPED;

    await analyticsService.trackPlatform(metricEvent, userId, projectId, {
      reason: opts.reason,
      durationMs,
      estimatedCostUsd,
      sandboxId,
    });
  }

  async killSandbox(sandboxId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const { Sandbox } = await import("e2b");
      await Sandbox.kill(sandboxId, { apiKey: env.E2B_API_KEY });
    } catch (err) {
      console.warn(`[preview] Failed to kill sandbox ${sandboxId}:`, err);
    }
  }
}

export const previewService = new PreviewService();
