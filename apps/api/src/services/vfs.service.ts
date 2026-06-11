import { prisma } from "../lib/prisma";
import {
  buildPathCursorPage,
  decodePathCursor,
  type ParsedCursorQuery,
} from "../lib/cursor-pagination";
import { projectService } from "./project.service";
import { eventService } from "./event.service";
import { fileHistoryService, type FileChangeSource } from "./file-history.service";
import { codeIndexService } from "./code-index.service";
import { previewSyncService } from "./preview/preview-sync.service";
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

  async searchFiles(
    projectId: string,
    userId: string,
    query: string,
    limit = 40
  ) {
    await projectService.get(projectId, userId);
    const q = query.trim();
    if (!q) return [];

    const [rows, symbols] = await Promise.all([
      prisma.file.findMany({
        where: {
          projectId,
          OR: [
            { path: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { path: "asc" },
        take: limit,
        select: { path: true, content: true },
      }),
      codeIndexService.searchSymbols(projectId, q, Math.min(limit, 15)),
    ]);

    const fileHits = rows.map((row) => {
      const idx = row.content.toLowerCase().indexOf(q.toLowerCase());
      const start = idx >= 0 ? Math.max(0, idx - 40) : 0;
      const snippet =
        idx >= 0
          ? row.content.slice(start, start + 120).replace(/\s+/g, " ")
          : row.path;
      return { path: row.path, snippet, kind: "file" as const };
    });

    const symbolHits = symbols.map((s) => ({
      path: s.path,
      snippet: `${s.kind} ${s.name} (line ${s.line})`,
      kind: "symbol" as const,
      symbol: s.name,
      line: s.line,
    }));

    const seen = new Set<string>();
    const merged = [];
    for (const hit of [...symbolHits, ...fileHits]) {
      const key = hit.kind === "symbol" ? `sym:${hit.path}:${hit.snippet}` : hit.path;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
      if (merged.length >= limit) break;
    }

    return merged;
  }

  /** Bulk read for editor LSP preloading — one query instead of N requests. */
  async readFilesBulk(
    projectId: string,
    userId: string,
    paths: string[]
  ): Promise<Array<{ path: string; content: string; version: number }>> {
    await projectService.get(projectId, userId);
    if (paths.length === 0) return [];
    return prisma.file.findMany({
      where: { projectId, path: { in: paths } },
      select: { path: true, content: true, version: true },
      orderBy: { path: "asc" },
    });
  }

  async readFile(
    projectId: string,
    userId: string,
    path: string,
    version?: number
  ) {
    await projectService.get(projectId, userId);

    if (version != null) {
      const row = await fileHistoryService.readVersion(projectId, userId, path, version);
      return {
        path: row.path,
        content: row.content,
        version: row.version,
        createdAt: row.createdAt,
      };
    }

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
    files: Array<{ path: string; content: string }>,
    options: { source?: FileChangeSource } = {}
  ) {
    await projectService.get(projectId, userId);

    const results: Array<{ path: string; version: number; createdAt: Date }> = [];

    for (const { path, content } of files) {
      const result = await this.writeFile(projectId, userId, path, content, {
        skipAuth: true,
        source: options.source ?? "user",
      });
      results.push(result);
    }

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: "files_batch_written",
      message: `Wrote ${results.length} files`,
      count: results.length,
      paths: results.map((r) => r.path),
    });

    previewSyncService.scheduleSync(
      projectId,
      files.map((f) => ({ path: f.path, content: f.content }))
    );

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
    options: { skipAuth?: boolean; source?: FileChangeSource } = {}
  ) {
    if (!options.skipAuth) {
      await projectService.get(projectId, userId);
    }

    const safeContent = sanitizeFileContent(content);

    const existing = await prisma.file.findUnique({
      where: { projectId_path: { projectId, path } },
    });

    if (existing) {
      await fileHistoryService.archiveVersion(
        projectId,
        path,
        existing.version,
        existing.content,
        options.source ?? "user"
      );
    }

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

    codeIndexService.scheduleIndexFile(projectId, path, safeContent);

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

    // Keep the code index in sync — otherwise symbol/file search keeps
    // returning the old path until a manual reindex.
    await codeIndexService.removeFile(projectId, fromPath).catch(() => undefined);
    await codeIndexService
      .indexFile(projectId, toPath, file.content)
      .catch(() => undefined);

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

    // Archive before deletion so checkpoint restore can resurrect the file.
    await fileHistoryService.archiveVersion(
      projectId,
      path,
      file.version,
      file.content,
      "user"
    );

    await prisma.file.delete({
      where: { projectId_path: { projectId, path } },
    });
    await codeIndexService.removeFile(projectId, path).catch(() => undefined);

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
