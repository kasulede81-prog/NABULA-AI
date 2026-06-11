import { prisma } from "../lib/prisma";
import {
  AgentError,
  NonRetryableErrorCodes,
  SseEvents,
  isRetryableError,
  sanitizePersistedText,
} from "@nebula/shared";
import { clarifierService } from "./clarifier.service";
import { builderService } from "./builder.service";
import { eventService } from "./event.service";
import { projectService } from "./project.service";
import { subscriptionService, BuildLimitError } from "./subscription.service";
import {
  analyticsService,
  PlatformMetricEvents,
} from "./analytics.service";
import { ProjectLock } from "../lib/project-lock";
import {
  assertBuildNotCancelled,
  clearBuildCancel,
  isBuildCancelRequested,
  requestBuildCancel,
} from "../lib/build-cancel";
import type { PipelineRunOptions } from "../types/pipeline";
import { agentQueueService } from "./agent-queue.service";

const MAX_BUILD_RETRIES = 2;

const clarifierLock = new ProjectLock("clarifier");
const builderLock = new ProjectLock("builder");

export class BuildService {
  requestCancel(projectId: string) {
    requestBuildCancel(projectId);
  }

  clearCancel(projectId: string) {
    clearBuildCancel(projectId);
  }

  isCancelRequested(projectId: string) {
    return isBuildCancelRequested(projectId);
  }

  assertNotCancelled(projectId: string) {
    assertBuildNotCancelled(projectId);
  }

  /** Run clarifier then builder (full pipeline). */
  async runPipeline(
    projectId: string,
    userId: string,
    options: PipelineRunOptions = {}
  ) {
    this.clearCancel(projectId);
    const project = await projectService.get(projectId, userId);

    if (project.specJson && project.status !== "clarifying") {
      return this.runBuilder(projectId, userId, options);
    }

    const clarifierResult = await this.runClarifier(
      projectId,
      userId,
      project.status === "clarifying",
      options
    );

    if (!clarifierResult.ready) {
      return { phase: "clarifying" as const, ...clarifierResult };
    }

    return this.runBuilder(projectId, userId, options);
  }

  /** Run clarifier only. One active run per project. */
  async runClarifier(
    projectId: string,
    userId: string,
    forceReady?: boolean,
    options: PipelineRunOptions = {}
  ) {
    const project = await projectService.get(projectId, userId);
    const shouldForce = forceReady ?? project.status === "clarifying";

    try {
      await subscriptionService.assertBuildAllowed(userId);
      await subscriptionService.consumeAiSlot(userId, projectId);
    } catch (err) {
      if (err instanceof BuildLimitError) {
        await this.handleBuildLimitReached(projectId, userId, err);
      }
      throw err;
    }

    clarifierLock.tryAcquire(projectId);
    try {
      this.assertNotCancelled(projectId);
      return await clarifierService.run(projectId, userId, shouldForce, options);
    } finally {
      clarifierLock.release(projectId);
      this.clearCancel(projectId);
    }
  }

  /** Run builder with retry loop (max 2 retries). */
  async runBuilder(projectId: string, userId: string, options: PipelineRunOptions = {}) {
    try {
      await subscriptionService.consumeBuildSlot(userId, projectId);
    } catch (err) {
      if (err instanceof BuildLimitError) {
        await this.handleBuildLimitReached(projectId, userId, err);
      }
      throw err;
    }

    builderLock.tryAcquire(projectId);

    try {
      let lastError = "";
      const maxAttempts = MAX_BUILD_RETRIES + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          this.assertNotCancelled(projectId);
          const result = await builderService.run(projectId, userId, {
            userMessage: options.userMessage,
            errorContext: attempt > 1 ? lastError : undefined,
            attempt,
            llmProvider: options.llmProvider,
            deferWrites: options.deferWrites,
          });
          return { phase: "ready" as const, ...result };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);

          if (!isRetryableError(err) || attempt >= maxAttempts) {
            await this.markBuildFailed(projectId, lastError, err);
            throw this.toBuildServiceError(err, lastError);
          }

          eventService.publish(projectId, SseEvents.PROGRESS, {
            step: "build_retry",
            message: `Build failed, retrying (${attempt}/${MAX_BUILD_RETRIES})...`,
            error: lastError,
          });
        }
      }

      throw new BuildServiceError("BUILD_FAILED", lastError, 500);
    } finally {
      builderLock.release(projectId);
      this.clearCancel(projectId);
    }
  }

  private async handleBuildLimitReached(
    projectId: string,
    userId: string,
    err: BuildLimitError
  ) {
    await analyticsService.trackPlatform(
      PlatformMetricEvents.BUILD_LIMIT_REACHED,
      userId,
      projectId,
      {
        buildsUsed: err.buildsUsed,
        buildsLimit: err.buildsLimit,
      }
    );

    eventService.publish(projectId, SseEvents.BUILD_LIMIT_REACHED, {
      message: "You have reached your monthly build limit.",
      buildsUsed: err.buildsUsed,
      buildsLimit: err.buildsLimit,
    });

    const message = await prisma.message.create({
      data: {
        projectId,
        role: "assistant",
        content: "You have reached your monthly build limit.",
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
  }

  private async markBuildFailed(
    projectId: string,
    lastError: string,
    err: unknown
  ) {
    if (err instanceof AgentError) {
      if (err.code === NonRetryableErrorCodes.NO_SPEC) {
        return;
      }
      // Builder already recorded failure on agent_runs and activity feed.
      return;
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });

    eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
      id: projectId,
      status: "failed",
    });

    const retryNote =
      err instanceof AgentError && !err.retryable
        ? "Build could not start."
        : `Build failed after ${MAX_BUILD_RETRIES} retries.`;

    const message = await prisma.message.create({
      data: {
        projectId,
        role: "assistant",
        content: sanitizePersistedText(
          `${retryNote}\n\nError: ${lastError}\n\nPlease try again or refine your request.`
        ),
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
  }

  private toBuildServiceError(err: unknown, fallbackMessage: string): BuildServiceError {
    if (err instanceof BuildLimitError) {
      return new BuildServiceError(err.code, err.message, err.status);
    }
    if (err instanceof AgentError) {
      return new BuildServiceError(err.code, err.message, err.status);
    }
    if (err instanceof BuildServiceError) {
      return err;
    }
    return new BuildServiceError("BUILD_FAILED", fallbackMessage, 500);
  }

  isClarifierActive(projectId: string): boolean {
    return clarifierLock.isActive(projectId);
  }

  isBuilderActive(projectId: string): boolean {
    return builderLock.isActive(projectId);
  }

  isPipelineActive(projectId: string): boolean {
    return this.isClarifierActive(projectId) || this.isBuilderActive(projectId);
  }

  /** Enqueue pipeline for background worker (priority queue for Pro). */
  schedulePipeline(
    projectId: string,
    userId: string,
    options: PipelineRunOptions = {}
  ) {
    void agentQueueService.enqueue({
      projectId,
      userId,
      kind: "pipeline",
      options,
    });
  }

  /** Enqueue pipeline after current agent finishes. */
  schedulePipelineWhenIdle(
    projectId: string,
    userId: string,
    options: PipelineRunOptions = {}
  ) {
    void agentQueueService.enqueue({
      projectId,
      userId,
      kind: "pipeline",
      options,
      waitForIdle: true,
    });
  }

  scheduleClarifier(projectId: string, userId: string) {
    void agentQueueService.enqueue({
      projectId,
      userId,
      kind: "clarifier",
    });
  }

  scheduleBuilder(
    projectId: string,
    userId: string,
    options: PipelineRunOptions = {}
  ) {
    void agentQueueService.enqueue({
      projectId,
      userId,
      kind: "builder",
      options,
    });
  }
}

export class BuildServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const buildService = new BuildService();

/** Exposed for verification scripts only. */
export const __testLocks = { clarifierLock, builderLock };
