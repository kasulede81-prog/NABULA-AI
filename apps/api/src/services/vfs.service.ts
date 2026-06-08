import { prisma } from "../lib/prisma";
import {
  buildPathCursorPage,
  decodePathCursor,
  type ParsedCursorQuery,
} from "../lib/cursor-pagination";
import { projectService } from "./project.service";
import { eventService } from "./event.service";
import {
  AgentError,
  NonRetryableErrorCodes,
  SseEvents,
  sanitizeFileContent,
} from "@nebula/shared";

export interface FileNode {
  path: string;
  version: number;
  createdAt: Date;
}

export class VfsService {
  /** Full VFS snapshot for preview tarball upload. */
  async snapshot(
    projectId: string,
    userId: string
  ): Promise<Array<{ path: string; content: string }>> {
    await projectService.get(projectId, userId);
    return prisma.file.findMany({
      where: { projectId },
      select: { path: true, content: true },
      orderBy: { path: "asc" },
    });
  }

  async listTree(projectId: string, userId: string): Promise<FileNode[]> {
    await projectService.get(projectId, userId);

    return prisma.file.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
      select: { path: true, version: true, createdAt: true },
    });
  }

  async listTreePaginated(
    projectId: string,
    userId: string,
    pagination?: ParsedCursorQuery & { pathCursor?: string }
  ) {
    await projectService.get(projectId, userId);

    const limit = pagination?.limit ?? 50;
    const pathCursor = pagination?.pathCursor;

    const rows = await prisma.file.findMany({
      where: {
        projectId,
        ...(pathCursor ? { path: { gt: pathCursor } } : {}),
      },
      orderBy: { path: "asc" },
      take: limit + 1,
      select: { path: true, version: true, createdAt: true },
    });

    return buildPathCursorPage(rows, limit);
  }

  async readFile(projectId: string, userId: string, path: string) {
    await projectService.get(projectId, userId);

    const file = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
    });

    if (!file) {
      throw new VfsError("NOT_FOUND", "File not found", 404);
    }

    return {
      path: file.path,
      content: file.content,
      version: file.version,
      createdAt: file.createdAt,
    };
  }

  async writeFiles(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string }>
  ) {
    await projectService.get(projectId, userId);

    const results: Array<{ path: string; version: number; createdAt: Date }> = [];

    for (const { path, content } of files) {
      const result = await this.writeFile(projectId, userId, path, content, {
        skipAuth: true,
      });
      results.push(result);
    }

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: "files_batch_written",
      message: `Wrote ${results.length} files`,
      count: results.length,
      paths: results.map((r) => r.path),
    });

    return {
      written: results.map((r) => r.path),
      count: results.length,
    };
  }

  async writeFile(
    projectId: string,
    userId: string,
    path: string,
    content: string,
    options: { skipAuth?: boolean } = {}
  ) {
    if (!options.skipAuth) {
      await projectService.get(projectId, userId);
    }

    const safeContent = sanitizeFileContent(content);

    const existing = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
    });

    let file;
    try {
      file = await prisma.file.upsert({
        where: { projectId_path: { projectId, path } },
        create: { projectId, path, content: safeContent, version: 1 },
        update: {
          content: safeContent,
          version: (existing?.version ?? 0) + 1,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AgentError(
        NonRetryableErrorCodes.VFS_WRITE_ERROR,
        `Failed to persist ${path}: ${detail}`,
        500,
        false
      );
    }

    const payload = {
      path: file.path,
      version: file.version,
      createdAt: file.createdAt,
    };

    eventService.publish(
      projectId,
      existing ? SseEvents.FILE_UPDATED : SseEvents.FILE_CREATED,
      payload
    );

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: existing ? "file_updated" : "file_created",
      message: `${existing ? "Updated" : "Created"} ${path}`,
      path,
    });

    return {
      path: file.path,
      version: file.version,
      createdAt: file.createdAt,
    };
  }

  async renameFile(
    projectId: string,
    userId: string,
    fromPath: string,
    toPath: string
  ) {
    await projectService.get(projectId, userId);

    const existing = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path: fromPath } },
    });
    if (!existing) {
      throw new VfsError("NOT_FOUND", "Source file not found", 404);
    }

    const conflict = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path: toPath } },
    });
    if (conflict) {
      throw new VfsError("CONFLICT", "Destination path already exists", 409);
    }

    const file = await prisma.file.update({
      where: { projectId_path: { projectId, path: fromPath } },
      data: { path: toPath },
    });

    eventService.publish(projectId, SseEvents.FILE_DELETED, { path: fromPath });
    eventService.publish(projectId, SseEvents.FILE_CREATED, {
      path: file.path,
      version: file.version,
      createdAt: file.createdAt,
    });

    return {
      fromPath,
      path: file.path,
      version: file.version,
      createdAt: file.createdAt,
    };
  }

  async deleteFile(projectId: string, userId: string, path: string) {
    await projectService.get(projectId, userId);

    const file = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
    });

    if (!file) {
      throw new VfsError("NOT_FOUND", "File not found", 404);
    }

    await prisma.file.delete({
      where: { projectId_path: { projectId, path } },
    });

    eventService.publish(projectId, SseEvents.FILE_DELETED, { path });

    return { path };
  }
}

export class VfsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const vfsService = new VfsService();
