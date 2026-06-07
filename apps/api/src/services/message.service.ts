import { prisma } from "../lib/prisma";
import { projectService } from "./project.service";
import { eventService } from "./event.service";
import { SseEvents } from "@nebula/shared";
import type { CreateMessageInput } from "@nebula/shared";
import { buildService } from "./build.service";

export class MessageService {
  async list(projectId: string, userId: string) {
    await projectService.get(projectId, userId);

    return prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });
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

    if (project.status === "clarifying") {
      if (buildService.isPipelineActive(projectId)) {
        buildService.schedulePipelineWhenIdle(projectId, userId, input.content);
      } else {
        buildService.schedulePipeline(projectId, userId, input.content);
      }
    } else if (project.status === "ready" && project.specJson) {
      if (!buildService.isBuilderActive(projectId)) {
        buildService.scheduleBuilder(projectId, userId, input.content);
      }
    } else if (project.status === "failed" && project.specJson) {
      if (!buildService.isBuilderActive(projectId)) {
        buildService.scheduleBuilder(projectId, userId, input.content);
      }
    }

    return message;
  }
}

export const messageService = new MessageService();
