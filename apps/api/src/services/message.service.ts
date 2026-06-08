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

type ProjectForScheduling = {
  status: string;
  specJson: unknown;
};

type BuildScheduler = {
  isPipelineActive(projectId: string): boolean;
  schedulePipelineWhenIdle(
    projectId: string,
    userId: string,
    userMessage?: string
  ): void;
  schedulePipeline(
    projectId: string,
    userId: string,
    userMessage?: string
  ): void;
  isBuilderActive(projectId: string): boolean;
  scheduleBuilder(
    projectId: string,
    userId: string,
    userMessage?: string
  ): void;
};

/** Schedules clarifier/builder work after a user message (exported for verification). */
export function applyMessagePipelineScheduling(
  project: ProjectForScheduling,
  projectId: string,
  userId: string,
  content: string,
  build: BuildScheduler = buildService
) {
  if (project.status === "clarifying") {
    if (build.isPipelineActive(projectId)) {
      build.schedulePipelineWhenIdle(projectId, userId, content);
    } else {
      build.schedulePipeline(projectId, userId, content);
    }
  } else if (project.status === "draft" && !project.specJson) {
    if (build.isPipelineActive(projectId)) {
      build.schedulePipelineWhenIdle(projectId, userId, content);
    } else {
      build.schedulePipeline(projectId, userId, content);
    }
  } else if (project.status === "ready" && project.specJson) {
    if (!build.isBuilderActive(projectId)) {
      build.scheduleBuilder(projectId, userId, content);
    }
  } else if (project.status === "failed" && project.specJson) {
    if (!build.isBuilderActive(projectId)) {
      build.scheduleBuilder(projectId, userId, content);
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

    const message = await prisma.message.create({
      data: {
        projectId,
        role: "user",
        content: input.content,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);

    applyMessagePipelineScheduling(project, projectId, userId, input.content);

    return message;
  }
}

export const messageService = new MessageService();
