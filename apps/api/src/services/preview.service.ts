import { Sandbox } from "e2b";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";
import { eventService } from "./event.service";
import { analyticsService, PlatformMetricEvents } from "./analytics.service";
import {
  SseEvents,
  validateBuildReady,
  type AppSpec,
} from "@nebula/shared";

type PreviewStatus = "starting" | "ready" | "stopped" | "error";

const PREVIEW_PORT = 3000;
const DEV_SERVER_WAIT_MS = 45_000;
const DEV_SERVER_POLL_MS = 2_000;

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
  previewUrl: string | null;
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
  url: string | null;
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
    previewUrl: row.url,
    sandboxId: row.sandboxId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    startedAt: row.startedAt ?? null,
    estimatedCostUsd: row.estimatedCostUsd ?? null,
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

  async countActiveForUser(userId: string, excludeProjectId?: string): Promise<number> {
    return prisma.preview.count({
      where: {
        status: { in: ["starting", "ready"] },
        project: { userId },
        ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
      },
    });
  }

  /** Validate project is ready and has required preview files. */
  async validateReadyForPreview(projectId: string, userId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new PreviewError(
        "E2B_NOT_CONFIGURED",
        "E2B_API_KEY is not configured",
        503
      );
    }

    const project = await projectService.get(projectId, userId);

    if (project.status !== "ready") {
      throw new PreviewError(
        "PROJECT_NOT_READY",
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

  async start(projectId: string, userId: string): Promise<PreviewRecord> {
    if (!this.isConfigured()) {
      throw new PreviewError(
        "E2B_NOT_CONFIGURED",
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
          url: null,
          sandboxId: null,
          expiresAt,
          startedAt: null,
          estimatedCostUsd: null,
        },
        update: {
          status: "starting",
          url: null,
          sandboxId: null,
          expiresAt,
          startedAt: null,
          estimatedCostUsd: null,
        },
      });

      eventService.publish(projectId, SseEvents.PREVIEW_STARTED, {
        previewId: preview.id,
        message: "Provisioning E2B sandbox...",
        expiresAt: expiresAt.toISOString(),
      });

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_STARTED,
        userId,
        projectId,
        { previewId: preview.id, expiresAt: expiresAt.toISOString() }
      );

      const files = await vfsService.snapshot(projectId, userId);
      const sandbox = await Sandbox.create({
        apiKey: env.E2B_API_KEY,
        template: env.E2B_PREVIEW_TEMPLATE,
        timeoutMs: env.PREVIEW_SANDBOX_TIMEOUT_MS,
      });

      await sandbox.files.write(
        files.map((f) => ({
          path: f.path,
          data: f.content,
        }))
      );

      const hasPrisma = files.some((f) => f.path === "prisma/schema.prisma");
      if (hasPrisma) {
        const prismaGen = await sandbox.commands.run("npx prisma generate 2>&1", {
          timeoutMs: 120_000,
        });
        if (prismaGen.exitCode !== 0) {
          throw new Error(`prisma generate failed: ${prismaGen.stderr || prismaGen.stdout}`);
        }

        const prismaPush = await sandbox.commands.run(
          "npx prisma db push --accept-data-loss 2>&1",
          { timeoutMs: 120_000 }
        );
        if (prismaPush.exitCode !== 0) {
          throw new Error(`prisma db push failed: ${prismaPush.stderr || prismaPush.stdout}`);
        }
      }

      await sandbox.commands.run(
        `nohup npm run dev -- --hostname 0.0.0.0 --port ${PREVIEW_PORT} > /tmp/next-dev.log 2>&1 &`,
        { timeoutMs: 15_000 }
      );

      await this.waitForDevServer(sandbox);

      const host = sandbox.getHost(PREVIEW_PORT);
      const previewUrl = host.startsWith("http") ? host : `https://${host}`;
      const readyAt = new Date();

      const ready = await prisma.preview.update({
        where: { projectId },
        data: {
          status: "ready",
          url: previewUrl,
          sandboxId: sandbox.sandboxId,
          expiresAt,
          startedAt: readyAt,
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { previewUrl },
      });

      eventService.publish(projectId, SseEvents.PREVIEW_READY, {
        previewId: ready.id,
        previewUrl,
        sandboxId: sandbox.sandboxId,
        expiresAt: expiresAt.toISOString(),
      });

      await analyticsService.trackPlatform(
        PlatformMetricEvents.PREVIEW_READY,
        userId,
        projectId,
        {
          previewId: ready.id,
          sandboxId: sandbox.sandboxId,
          provisionDurationMs: readyAt.getTime() - provisionStartedAt.getTime(),
        }
      );

      return toPreviewRecord(ready);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview provisioning failed";

      await prisma.preview.upsert({
        where: { projectId },
        create: {
          projectId,
          status: "error",
          url: null,
          sandboxId: null,
        },
        update: {
          status: "error",
          url: null,
        },
      });

      eventService.publish(projectId, SseEvents.PREVIEW_FAILED, {
        message,
        code: err instanceof PreviewError ? err.code : "PREVIEW_FAILED",
      });

      throw err instanceof PreviewError
        ? err
        : new PreviewError("PREVIEW_FAILED", message, 500);
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
      await Sandbox.kill(sandboxId, { apiKey: env.E2B_API_KEY });
    } catch (err) {
      console.warn(`[preview] Failed to kill sandbox ${sandboxId}:`, err);
    }
  }

  private async waitForDevServer(sandbox: Sandbox): Promise<void> {
    const deadline = Date.now() + DEV_SERVER_WAIT_MS;
    while (Date.now() < deadline) {
      const probe = await sandbox.commands.run(
        `curl -sf http://127.0.0.1:${PREVIEW_PORT} > /dev/null 2>&1; echo $?`,
        { timeoutMs: 10_000 }
      );
      const code = probe.stdout.trim();
      if (code === "0") return;
      await sleep(DEV_SERVER_POLL_MS);
    }
    throw new Error("Next.js dev server did not become ready in time");
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const previewService = new PreviewService();
