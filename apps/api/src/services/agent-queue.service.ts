import type { Prisma } from "@nebula/database";
import { prisma } from "../lib/prisma";
import { getRedis, RedisChannels } from "../lib/redis";
import { agentQueueBullmqService } from "./agent-queue-bullmq.service";

type AgentQueueJobKind = "pipeline" | "clarifier" | "builder";
import { billingService } from "./billing/billing.service";
import { buildService } from "./build.service";
import type { PipelineRunOptions } from "../types/pipeline";

const WORKER_INTERVAL_MS = 2000;
const STALE_RUNNING_MS = 30 * 60 * 1000;

export class AgentQueueService {
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private redisSubscribed = false;

  startWorker() {
    if (agentQueueBullmqService.isEnabled()) {
      agentQueueBullmqService.start();
    }
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      void this.processNext();
    }, WORKER_INTERVAL_MS);

    const redis = getRedis();
    if (redis && !this.redisSubscribed) {
      this.redisSubscribed = true;
      const sub = redis.duplicate();
      void sub.subscribe(RedisChannels.agentQueueTick, () => undefined);
      sub.on("message", () => {
        void this.processNext();
      });
    }
  }

  stopWorker() {
    agentQueueBullmqService.stop();
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async getPriority(userId: string): Promise<number> {
    const snap = await billingService.getSnapshot(userId);
    return snap.priorityQueue ? 10 : 0;
  }

  async enqueue(params: {
    projectId: string;
    userId: string;
    kind: AgentQueueJobKind;
    options?: PipelineRunOptions;
    waitForIdle?: boolean;
  }) {
    const { projectId, userId, kind, options = {}, waitForIdle = false } = params;

    if (!waitForIdle && buildService.isPipelineActive(projectId)) {
      return { enqueued: false, reason: "active" as const };
    }

    const existing = await prisma.agentQueueJob.findFirst({
      where: { projectId, kind, status: "pending" },
      select: { id: true },
    });
    if (existing) {
      return { enqueued: false, reason: "duplicate" as const, jobId: existing.id };
    }

    const priority = await this.getPriority(userId);
    const job = await prisma.agentQueueJob.create({
      data: {
        projectId,
        userId,
        kind,
        priority,
        waitForIdle,
        payload: options as Prisma.InputJsonValue,
      },
      select: { id: true, priority: true, status: true, createdAt: true },
    });

    const bullEnqueued = await agentQueueBullmqService.enqueueJob({
      jobId: job.id,
      projectId,
      userId,
      kind,
      priority,
      options,
    });

    if (!bullEnqueued) {
      const redis = getRedis();
      if (redis) {
        void redis
          .publish(RedisChannels.agentQueueTick, job.id)
          .catch(() => undefined);
      }
    }

    return { enqueued: true, job };
  }

  async listForProject(projectId: string, limit = 20) {
    return prisma.agentQueueJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        status: true,
        priority: true,
        waitForIdle: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });
  }

  async processNext() {
    if (agentQueueBullmqService.isEnabled()) return;
    if (this.processing) return;
    this.processing = true;

    try {
      // Recover jobs orphaned by a crash mid-run — without this they stay
      // "running" forever and block dedupe for their project/kind.
      await prisma.agentQueueJob.updateMany({
        where: {
          status: "running",
          startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
        },
        data: {
          status: "failed",
          errorMessage: "Worker crashed or timed out while running this job",
          completedAt: new Date(),
        },
      });

      const candidates = await prisma.agentQueueJob.findMany({
        where: { status: "pending" },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 10,
      });

      for (const job of candidates) {
        if (job.waitForIdle && buildService.isPipelineActive(job.projectId)) {
          continue;
        }
        if (!job.waitForIdle && buildService.isPipelineActive(job.projectId)) {
          continue;
        }

        // Atomic claim: only one worker can flip pending → running.
        const claimed = await prisma.agentQueueJob.updateMany({
          where: { id: job.id, status: "pending" },
          data: { status: "running", startedAt: new Date() },
        });
        if (claimed.count === 0) continue;

        const options = (job.payload ?? {}) as PipelineRunOptions;

        try {
          if (job.kind === "pipeline") {
            await buildService.runPipeline(job.projectId, job.userId, options);
          } else if (job.kind === "clarifier") {
            await buildService.runClarifier(job.projectId, job.userId);
          } else {
            await buildService.runBuilder(job.projectId, job.userId, options);
          }

          await prisma.agentQueueJob.update({
            where: { id: job.id },
            data: { status: "completed", completedAt: new Date() },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await prisma.agentQueueJob.update({
            where: { id: job.id },
            data: {
              status: "failed",
              errorMessage: msg,
              completedAt: new Date(),
            },
          });
        }

        return;
      }
    } finally {
      this.processing = false;
    }
  }
}

export const agentQueueService = new AgentQueueService();
