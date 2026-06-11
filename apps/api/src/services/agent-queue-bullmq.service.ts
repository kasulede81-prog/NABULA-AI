import { Queue, Worker } from "bullmq";
import type { Prisma } from "@nebula/database";
import { prisma } from "../lib/prisma";
import { isRedisEnabled } from "../lib/redis";
import { env } from "../config/env";
import { buildService } from "./build.service";
import type { PipelineRunOptions } from "../types/pipeline";

const QUEUE_NAME = "nebula-agent-jobs";

type AgentQueueJobKind = "pipeline" | "clarifier" | "builder";

function connectionOpts() {
  if (!env.REDIS_URL) return null;
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

export class AgentQueueBullmqService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  isEnabled() {
    return isRedisEnabled();
  }

  start() {
    const connection = connectionOpts();
    if (!connection || this.worker) return;

    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { jobId, projectId, userId, kind, options } = job.data as {
          jobId: string;
          projectId: string;
          userId: string;
          kind: AgentQueueJobKind;
          options: PipelineRunOptions;
        };

        await prisma.agentQueueJob.update({
          where: { id: jobId },
          data: { status: "running", startedAt: new Date() },
        });

        try {
          if (kind === "pipeline") {
            await buildService.runPipeline(projectId, userId, options);
          } else if (kind === "clarifier") {
            await buildService.runClarifier(projectId, userId);
          } else {
            await buildService.runBuilder(projectId, userId, options);
          }

          await prisma.agentQueueJob.update({
            where: { id: jobId },
            data: { status: "completed", completedAt: new Date() },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await prisma.agentQueueJob.update({
            where: { id: jobId },
            data: {
              status: "failed",
              errorMessage: msg,
              completedAt: new Date(),
            },
          });
          throw err;
        }
      },
      { connection, concurrency: 2 }
    );
  }

  stop() {
    void this.worker?.close();
    void this.queue?.close();
    this.worker = null;
    this.queue = null;
  }

  async enqueueJob(data: {
    jobId: string;
    projectId: string;
    userId: string;
    kind: AgentQueueJobKind;
    priority: number;
    options: PipelineRunOptions;
  }) {
    if (!this.queue) return false;
    await this.queue.add(
      data.kind,
      {
        jobId: data.jobId,
        projectId: data.projectId,
        userId: data.userId,
        kind: data.kind,
        options: data.options,
      },
      { priority: data.priority, removeOnComplete: 100, removeOnFail: 50 }
    );
    return true;
  }
}

export const agentQueueBullmqService = new AgentQueueBullmqService();
