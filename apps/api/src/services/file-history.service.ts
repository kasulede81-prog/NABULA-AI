import { prisma } from "../lib/prisma";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";

export type FileChangeSource = "user" | "agent" | "ai_edit" | "restore";

export class FileHistoryService {
  async archiveVersion(
    projectId: string,
    path: string,
    version: number,
    content: string,
    source: FileChangeSource
  ) {
    await prisma.fileVersion.upsert({
      where: {
        projectId_path_version: { projectId, path, version },
      },
      create: { projectId, path, version, content, source },
      update: { content, source },
    });
  }

  async listFileHistory(
    projectId: string,
    userId: string,
    path: string,
    limit = 30
  ) {
    await projectService.get(projectId, userId);

    const current = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
      select: { version: true, content: true, createdAt: true },
    });

    const versions = await prisma.fileVersion.findMany({
      where: { projectId, path },
      orderBy: { version: "desc" },
      take: limit,
      select: {
        version: true,
        source: true,
        createdAt: true,
      },
    });

    return {
      path,
      currentVersion: current?.version ?? null,
      versions: [
        ...(current
          ? [
              {
                version: current.version,
                source: "current" as const,
                createdAt: current.createdAt,
              },
            ]
          : []),
        ...versions.map((v) => ({
          version: v.version,
          source: v.source,
          createdAt: v.createdAt,
        })),
      ],
    };
  }

  async readVersion(
    projectId: string,
    userId: string,
    path: string,
    version: number
  ) {
    await projectService.get(projectId, userId);

    const current = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
    });

    if (current && current.version === version) {
      return {
        path,
        version: current.version,
        content: current.content,
        source: "current",
        createdAt: current.createdAt,
      };
    }

    const archived = await prisma.fileVersion.findUnique({
      where: {
        projectId_path_version: { projectId, path, version },
      },
    });

    if (!archived) {
      throw new FileHistoryError("NOT_FOUND", "Version not found", 404);
    }

    return {
      path,
      version: archived.version,
      content: archived.content,
      source: archived.source,
      createdAt: archived.createdAt,
    };
  }

  async listProjectTimeline(projectId: string, userId: string, limit = 50) {
    await projectService.get(projectId, userId);

    const rows = await prisma.fileVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        path: true,
        version: true,
        source: true,
        createdAt: true,
      },
    });

    return { data: rows };
  }

  /**
   * Checkpoint restore (Cursor-style): revert the project to its state at
   * a point in time, using archived file versions.
   */
  async restoreToTimestamp(projectId: string, userId: string, at: Date) {
    await projectService.get(projectId, userId);

    const [currentFiles, archivedAfter] = await Promise.all([
      prisma.file.findMany({
        where: { projectId },
        select: { path: true, createdAt: true },
      }),
      // Archived rows created after T hold the content that was active at T
      // (a row is archived at the moment it gets overwritten/deleted).
      // Order by archive time: the EARLIEST archive after T per path is
      // exactly what was live at T — version numbers can reset when a file
      // is deleted and recreated, so they are not a reliable ordering.
      prisma.fileVersion.findMany({
        where: { projectId, createdAt: { gt: at } },
        orderBy: [{ path: "asc" }, { createdAt: "asc" }],
        select: { path: true, version: true, content: true },
      }),
    ]);

    const restoreContent = new Map<string, string>();
    for (const row of archivedAfter) {
      // First (earliest archived-after-T) row per path = state at T.
      if (!restoreContent.has(row.path)) {
        restoreContent.set(row.path, row.content);
      }
    }

    const writes: Array<{ path: string; content: string }> = [];
    const deletes: string[] = [];
    const currentPaths = new Set(currentFiles.map((f) => f.path));

    for (const file of currentFiles) {
      const restored = restoreContent.get(file.path);
      if (restored !== undefined) {
        writes.push({ path: file.path, content: restored });
      } else if (file.createdAt > at) {
        // File did not exist at T and has no pre-T history → remove it.
        deletes.push(file.path);
      }
    }

    // Resurrect files that existed at T but were deleted afterwards
    // (deleteFile archives content before removal).
    for (const [path, content] of restoreContent) {
      if (!currentPaths.has(path)) {
        writes.push({ path, content });
      }
    }

    if (writes.length > 0) {
      await vfsService.writeFiles(projectId, userId, writes, {
        source: "restore",
      });
    }
    for (const path of deletes) {
      try {
        await vfsService.deleteFile(projectId, userId, path);
      } catch {
        /* best-effort */
      }
    }

    return {
      restored: writes.length,
      deleted: deletes.length,
      paths: [...writes.map((w) => w.path), ...deletes],
    };
  }

  async listSnapshots(projectId: string, userId: string, limit = 30) {
    await projectService.get(projectId, userId);

    const rows = await prisma.fileVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        path: true,
        version: true,
        source: true,
        createdAt: true,
      },
    });

    const buckets = new Map<
      string,
      {
        id: string;
        createdAt: string;
        source: string;
        fileCount: number;
        paths: string[];
      }
    >();

    for (const row of rows) {
      const bucketKey = row.createdAt.toISOString().slice(0, 16);
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.fileCount += 1;
        if (existing.paths.length < 8) existing.paths.push(row.path);
      } else {
        buckets.set(bucketKey, {
          id: bucketKey,
          createdAt: row.createdAt.toISOString(),
          source: row.source,
          fileCount: 1,
          paths: [row.path],
        });
      }
    }

    return {
      data: [...buckets.values()].slice(0, limit),
      branch: "main",
    };
  }
}

export class FileHistoryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const fileHistoryService = new FileHistoryService();
