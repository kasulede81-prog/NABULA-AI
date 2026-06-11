import { prisma } from "../lib/prisma";
import {
  buildCursorPage,
  cursorWhereAsc,
  type ParsedCursorQuery,
} from "../lib/cursor-pagination";
import { projectService } from "./project.service";
import { eventService } from "./event.service";
import { SseEvents } from "@nebula/shared";
import type { CreateMessageInput } from "@nebula/shared";
import { buildService } from "./build.service";
import { askService } from "./ask.service";
import { buildMessageContext } from "./message-context.service";
import type { PipelineRunOptions } from "../types/pipeline";

type ProjectForScheduling = {
  status: string;
  specJson: unknown;
};

type BuildScheduler = {
  isPipelineActive(projectId: string): boolean;
  schedulePipelineWhenIdle(
    projectId: string,
    userId: string,
    options?: PipelineRunOptions
  ): void;
  schedulePipeline(
    projectId: string,
    userId: string,
    options?: PipelineRunOptions
  ): void;
  isBuilderActive(projectId: string): boolean;
  scheduleBuilder(
    projectId: string,
    userId: string,
    options?: PipelineRunOptions
  ): void;
};

/** Schedules clarifier/builder work after a user message (exported for verification). */
export function applyMessagePipelineScheduling(
  project: ProjectForScheduling,
  projectId: string,
  userId: string,
  options: PipelineRunOptions = {},
  build: BuildScheduler = buildService
) {
  if (project.status === "clarifying") {
    if (build.isPipelineActive(projectId)) {
      build.schedulePipelineWhenIdle(projectId, userId, options);
    } else {
      build.schedulePipeline(projectId, userId, options);
    }
  } else if (project.status === "draft" && !project.specJson) {
    if (build.isPipelineActive(projectId)) {
      build.schedulePipelineWhenIdle(projectId, userId, options);
    } else {
      build.schedulePipeline(projectId, userId, options);
    }
  } else if (project.status === "ready" && project.specJson) {
    if (!build.isBuilderActive(projectId)) {
      build.scheduleBuilder(projectId, userId, options);
    }
  } else if (project.status === "failed" && project.specJson) {
    if (!build.isBuilderActive(projectId)) {
      build.scheduleBuilder(projectId, userId, options);
    }
  }
}

export class MessageService {
  async list(
    projectId: string,
    userId: string,
    pagination?: ParsedCursorQuery
  ) {
    await projectService.get(projectId, userId);

    const limit = pagination?.limit ?? 50;
    const cursorFilter = pagination?.cursor
      ? cursorWhereAsc(pagination.cursor)
      : {};

    const rows = await prisma.message.findMany({
      where: { projectId, ...cursorFilter },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return buildCursorPage(rows, limit);
  }

  async create(projectId: string, userId: string, input: CreateMessageInput) {
    const project = await projectService.get(projectId, userId);

    const { displayContent, agentContent } = await buildMessageContext(
      projectId,
      userId,
      input.content,
      input.attachedFiles
    );

    const message = await prisma.message.create({
      data: {
        projectId,
        role: "user",
        content: displayContent,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);

    if (input.chatMode === "ask") {
      askService.schedule(projectId, userId, {
        agentContent,
        llmProvider: input.llmProvider,
        images: input.images,
      });
    } else {
      // Pipeline agents are text-driven; note attachments so they aren't silent.
      const imageNote =
        input.images && input.images.length > 0
          ? `\n\n[User attached ${input.images.length} image(s) — switch to Ask mode to analyze them visually]`
          : "";
      const deferWrites =
        input.chatMode === "composer" ||
        project.status === "ready" ||
        project.status === "failed";
      applyMessagePipelineScheduling(project, projectId, userId, {
        userMessage: agentContent + imageNote,
        llmProvider: input.llmProvider,
        deferWrites,
      });
    }

    return message;
  }
}

export const messageService = new MessageService();
