import { prisma } from "../lib/prisma";
import { uniqueSlug } from "../lib/slug";
import { eventService } from "./event.service";
import { SseEvents } from "@nebula/shared";
import type { CreateProjectInput, UpdateProjectInput } from "@nebula/shared";
import { buildService } from "./build.service";
import { previewService } from "./preview.service";
import {
  buildCursorPage,
  cursorWhereDesc,
  type ParsedCursorQuery,
} from "../lib/cursor-pagination";
import { workspaceAccessService } from "./collaboration/workspace-access.service";

const projectSelect = {
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
  workspaceId: true,
  visibility: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class ProjectService {
  async list(
    userId: string,
    filters?: {
      workspaceId?: string | null;
      scope?: "personal" | "all";
    },
    pagination?: ParsedCursorQuery
  ) {
    const limit = pagination?.limit ?? 50;
    const cursorFilter = pagination?.cursor
      ? cursorWhereDesc(pagination.cursor)
      : {};

    let baseWhere: Record<string, unknown> = {};

    if (filters?.workspaceId) {
      await workspaceAccessService.requireMembership(filters.workspaceId, userId);
      baseWhere = { workspaceId: filters.workspaceId };
    } else if (filters?.scope === "personal") {
      baseWhere = { userId, workspaceId: null };
    } else {
      const workspaceIds =
        await workspaceAccessService.getMemberWorkspaceIds(userId);
      baseWhere = {
        OR: [
          { userId, workspaceId: null },
          { workspaceId: { in: workspaceIds } },
        ],
      };
    }

    const rows = await prisma.project.findMany({
      where: { ...baseWhere, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: projectSelect,
    });

    return buildCursorPage(rows, limit);
  }

  async get(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new ProjectError("NOT_FOUND", "Project not found", 404);
    }

    const allowed = await workspaceAccessService.canAccessProject(userId, project);
    if (!allowed) {
      throw new ProjectError("NOT_FOUND", "Project not found", 404);
    }

    return project;
  }

  async create(userId: string, input: CreateProjectInput) {
    let workspaceId: string | null = null;
    let visibility: "personal" | "workspace" = "personal";

    if (input.workspaceId) {
      await workspaceAccessService.requireMembership(input.workspaceId, userId, "member");
      workspaceId = input.workspaceId;
      visibility = "workspace";
    }

    const slug = await uniqueSlug(input.name, async (s) => {
      if (workspaceId) {
        const found = await prisma.project.findFirst({
          where: { workspaceId, slug: s },
        });
        return !!found;
      }
      const found = await prisma.project.findFirst({
        where: { userId, slug: s },
      });
      return !!found;
    });

    const project = await prisma.project.create({
      data: {
        userId,
        workspaceId,
        visibility,
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
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new ProjectError("NOT_FOUND", "Project not found", 404);
    }

    await workspaceAccessService.requireProjectDelete(userId, project);

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
