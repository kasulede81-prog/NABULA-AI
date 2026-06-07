import { prisma } from "../lib/prisma";
import { uniqueSlug } from "../lib/slug";
import { eventService } from "./event.service";
import { SseEvents } from "@nebula/shared";
import type { CreateProjectInput, UpdateProjectInput } from "@nebula/shared";
import { buildService } from "./build.service";
import { previewService } from "./preview.service";

export class ProjectService {
  async list(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        prompt: true,
        status: true,
        previewUrl: true,
        githubRepoUrl: true,
        githubRepoFullName: true,
        githubExportedAt: true,
        buildCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(projectId: string, userId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new ProjectError("NOT_FOUND", "Project not found", 404);
    }
    return project;
  }

  async create(userId: string, input: CreateProjectInput) {
    const slug = await uniqueSlug(input.name, async (s) => {
      const found = await prisma.project.findFirst({
        where: { userId, slug: s },
      });
      return !!found;
    });

    const project = await prisma.project.create({
      data: {
        userId,
        name: input.name,
        slug,
        prompt: input.prompt,
        status: "draft",
      },
    });

    await prisma.message.create({
      data: {
        projectId: project.id,
        role: "system",
        content: `Project created: ${input.prompt}`,
      },
    });

    buildService.schedulePipeline(project.id, userId);

    return project;
  }

  async update(projectId: string, userId: string, input: UpdateProjectInput) {
    await this.get(projectId, userId);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: input,
    });

    eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
      id: project.id,
      status: project.status,
      name: project.name,
    });

    return project;
  }

  async delete(projectId: string, userId: string) {
    await this.get(projectId, userId);
    try {
      await previewService.stop(projectId, userId);
    } catch {
      /* preview may not exist */
    }
    await prisma.project.delete({ where: { id: projectId } });
    eventService.unsubscribeAll(projectId);
  }
}

export class ProjectError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const projectService = new ProjectService();
