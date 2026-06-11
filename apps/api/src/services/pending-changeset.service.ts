import { SseEvents } from "@nebula/shared";
import { prisma } from "../lib/prisma";
import { eventService } from "./event.service";
import { vfsService } from "./vfs.service";
import { autoPreviewService } from "./auto-preview.service";
import { bugbotService } from "./bugbot.service";

export interface ProposedFileChange {
  path: string;
  previousContent: string;
  newContent: string;
}

export class PendingChangesetService {
  async has(projectId: string): Promise<boolean> {
    const count = await prisma.pendingChangesetEntry.count({
      where: { projectId },
    });
    return count > 0;
  }

  async getProposal(projectId: string): Promise<ProposedFileChange[]> {
    const rows = await prisma.pendingChangesetEntry.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
    });
    return rows.map((r) => ({
      path: r.path,
      previousContent: r.previousContent,
      newContent: r.content,
    }));
  }

  async getStagedContent(
    projectId: string,
    path: string
  ): Promise<string | undefined> {
    const row = await prisma.pendingChangesetEntry.findUnique({
      where: { projectId_path: { projectId, path } },
      select: { content: true },
    });
    return row?.content;
  }

  async stageWrites(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string }>
  ): Promise<{ written: string[] }> {
    const written: string[] = [];

    for (const file of files) {
      let previousContent = "";
      try {
        const existing = await vfsService.readFile(
          projectId,
          userId,
          file.path
        );
        previousContent = existing.content;
      } catch {
        /* new file */
      }

      const existing = await prisma.pendingChangesetEntry.findUnique({
        where: { projectId_path: { projectId, path: file.path } },
      });

      await prisma.pendingChangesetEntry.upsert({
        where: { projectId_path: { projectId, path: file.path } },
        create: {
          projectId,
          path: file.path,
          content: file.content,
          previousContent: existing?.previousContent ?? previousContent,
        },
        update: {
          content: file.content,
        },
      });
      written.push(file.path);
    }

    if (written.length > 0) {
      const proposal = await this.getProposal(projectId);
      eventService.publish(projectId, SseEvents.CHANGESET_PROPOSED, {
        fileCount: proposal.length,
        files: proposal,
      });
      bugbotService.scheduleReview(projectId, userId, proposal);
    }

    return { written };
  }

  async listMergedPaths(projectId: string, userId: string): Promise<string[]> {
    const vfsFiles = await vfsService.listTree(projectId, userId);
    const paths = new Set(vfsFiles.map((f) => f.path));
    const staged = await prisma.pendingChangesetEntry.findMany({
      where: { projectId },
      select: { path: true },
    });
    for (const row of staged) paths.add(row.path);
    return [...paths].sort();
  }

  async readMergedFile(
    projectId: string,
    userId: string,
    path: string
  ): Promise<{ path: string; content: string; version: number | null }> {
    const staged = await this.getStagedContent(projectId, path);
    if (staged !== undefined) {
      return { path, content: staged, version: null };
    }
    return vfsService.readFile(projectId, userId, path);
  }

  async apply(projectId: string, userId: string, paths?: string[]) {
    // An explicit empty selection is a no-op, NOT "apply everything".
    if (paths && paths.length === 0) {
      return { applied: 0, paths: [] as string[] };
    }
    let proposal = await this.getProposal(projectId);
    if (paths && paths.length > 0) {
      const wanted = new Set(paths);
      proposal = proposal.filter((f) => wanted.has(f.path));
    }
    if (proposal.length === 0) {
      return { applied: 0, paths: [] as string[] };
    }

    const result = await vfsService.writeFiles(
      projectId,
      userId,
      proposal.map((f) => ({ path: f.path, content: f.newContent })),
      { source: "agent" }
    );

    if (paths && paths.length > 0) {
      await prisma.pendingChangesetEntry.deleteMany({
        where: { projectId, path: { in: proposal.map((f) => f.path) } },
      });
    } else {
      await this.clear(projectId);
    }

    eventService.publish(projectId, SseEvents.CHANGESET_APPLIED, {
      fileCount: result.written.length,
      paths: result.written,
    });

    // Partial apply: re-announce what's still pending so clients don't
    // treat CHANGESET_APPLIED as "everything resolved".
    if (paths && paths.length > 0) {
      const remaining = await this.getProposal(projectId);
      if (remaining.length > 0) {
        eventService.publish(projectId, SseEvents.CHANGESET_PROPOSED, {
          fileCount: remaining.length,
          files: remaining,
        });
      }
    }

    void autoPreviewService
      .scheduleAfterBuild(projectId, userId, "changeset_applied")
      .catch(() => undefined);

    return { applied: result.written.length, paths: result.written };
  }

  async discard(projectId: string, paths?: string[]) {
    // An explicit empty selection is a no-op, NOT "discard everything".
    if (paths && paths.length === 0) {
      return { discarded: 0 };
    }
    const where =
      paths && paths.length > 0
        ? { projectId, path: { in: paths } }
        : { projectId };
    const count = await prisma.pendingChangesetEntry.count({ where });
    await prisma.pendingChangesetEntry.deleteMany({ where });
    if (count > 0) {
      eventService.publish(projectId, SseEvents.CHANGESET_DISCARDED, {
        fileCount: count,
      });
    }
    return { discarded: count };
  }

  /** Replace staged content for a path (per-hunk partial accept). */
  async updateStaged(projectId: string, path: string, content: string) {
    const { count } = await prisma.pendingChangesetEntry.updateMany({
      where: { projectId, path },
      data: { content },
    });
    return { path, updated: count > 0 };
  }

  async clear(projectId: string) {
    await prisma.pendingChangesetEntry.deleteMany({ where: { projectId } });
  }
}

export const pendingChangesetService = new PendingChangesetService();
