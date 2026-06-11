import { prisma } from "../../lib/prisma";
import { eventService } from "../event.service";
import { SseEvents } from "@nebula/shared";
import { githubFetch, GithubError } from "./github-api";
import { githubRepositoryService } from "./github-repository.service";
import { githubAuditService } from "./github-audit.service";

export type FileSnapshot = Record<string, { version: number }>;

interface SyncDiff {
  added: Array<{ path: string; content: string }>;
  modified: Array<{ path: string; content: string }>;
  deleted: string[];
}

export class GithubSyncService {
  async getSyncStatus(projectId: string, userId: string) {
    const repoInfo = await githubRepositoryService.getProjectRepository(
      projectId,
      userId
    );
    if (!repoInfo) {
      return { syncAvailable: false, changedFileCount: 0 };
    }

    const record = await prisma.githubRepository.findUnique({
      where: { projectId },
      select: { fileSnapshot: true },
    });
    // Status only needs counts — never load file contents here.
    const { added, modified, deleted } = await this.computeChangedPaths(
      projectId,
      record?.fileSnapshot
    );
    const changedFileCount = added.length + modified.length + deleted.length;
    return { syncAvailable: changedFileCount > 0, changedFileCount };
  }

  async syncRepository(projectId: string, userId: string) {
    const { repo, token } =
      await githubRepositoryService.assertRepositoryOwnership(projectId, userId);

    const diff = await this.computeDiff(projectId, userId, repo.fileSnapshot);
    const changeCount =
      diff.added.length + diff.modified.length + diff.deleted.length;

    if (changeCount === 0) {
      return {
        repositoryUrl: repo.repositoryUrl,
        defaultBranch: repo.defaultBranch,
        commitSha: repo.lastCommitSha,
        changedFiles: 0,
      };
    }

    eventService.publish(projectId, SseEvents.GITHUB_SYNC_STARTED, {
      message: `Syncing ${changeCount} file(s) to GitHub...`,
    });

    try {
      const [ownerName, repoName] = repo.repositoryName.split("/");
      const branch = repo.defaultBranch;
      const ref = await githubFetch<{ object: { sha: string } }>(
        `/repos/${ownerName}/${repoName}/git/ref/heads/${branch}`,
        token
      );
      const parentSha = ref.object.sha;

      const parentCommit = await githubFetch<{ tree: { sha: string } }>(
        `/repos/${ownerName}/${repoName}/git/commits/${parentSha}`,
        token
      );
      const baseTreeSha = parentCommit.tree.sha;

      const updates = [...diff.added, ...diff.modified];
      const treeItems: Array<{
        path: string;
        mode: string;
        type: string;
        sha: string | null;
      }> = [];

      for (const file of updates) {
        const blob = await githubFetch<{ sha: string }>(
          `/repos/${ownerName}/${repoName}/git/blobs`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              content: file.content,
              encoding: "utf-8",
            }),
          }
        );
        treeItems.push({
          path: file.path.replace(/\\/g, "/"),
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }

      for (const path of diff.deleted) {
        treeItems.push({
          path: path.replace(/\\/g, "/"),
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }

      const newTree = await githubFetch<{ sha: string }>(
        `/repos/${ownerName}/${repoName}/git/trees`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeItems,
          }),
        }
      );

      const commit = await githubFetch<{ sha: string }>(
        `/repos/${ownerName}/${repoName}/git/commits`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            message: `Sync from Nebula AI (${changeCount} file${changeCount === 1 ? "" : "s"})`,
            tree: newTree.sha,
            parents: [parentSha],
          }),
        }
      );

      await githubFetch(
        `/repos/${ownerName}/${repoName}/git/refs/heads/${branch}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha, force: false }),
        }
      );

      const fileSnapshot = await this.buildFileSnapshot(projectId);
      const now = new Date();

      await prisma.githubRepository.update({
        where: { projectId },
        data: {
          lastCommitSha: commit.sha,
          lastSyncedAt: now,
          fileSnapshot,
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { githubExportedAt: now },
      });

      await githubAuditService.log({
        userId,
        projectId,
        action: "repository_synced",
        metadata: {
          commitSha: commit.sha,
          changedFiles: changeCount,
        },
      });

      eventService.publish(projectId, SseEvents.GITHUB_SYNC_COMPLETED, {
        commitSha: commit.sha,
        changedFiles: changeCount,
      });

      return {
        repositoryUrl: repo.repositoryUrl,
        defaultBranch: repo.defaultBranch,
        commitSha: commit.sha,
        changedFiles: changeCount,
      };
    } catch (err) {
      const message =
        err instanceof GithubError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sync failed";

      await githubAuditService.log({
        userId,
        projectId,
        action: "repository_sync_failed",
        message,
        metadata: {
          code: err instanceof GithubError ? err.code : "SYNC_FAILED",
        },
      });

      eventService.publish(projectId, SseEvents.GITHUB_SYNC_FAILED, {
        message,
        code: err instanceof GithubError ? err.code : "SYNC_FAILED",
      });

      throw err instanceof GithubError
        ? err
        : new GithubError("SYNC_FAILED", message, 500);
    }
  }

  /** Path/version-only diff: one indexed query, no file contents, no N+1. */
  private async computeChangedPaths(projectId: string, snapshot: unknown) {
    const rows = await prisma.file.findMany({
      where: { projectId },
      select: { path: true, version: true },
    });
    const prev = (snapshot ?? {}) as FileSnapshot;
    const currentPaths = new Set(rows.map((r) => r.path));

    const added: string[] = [];
    const modified: string[] = [];
    for (const row of rows) {
      const prevEntry = prev[row.path];
      if (!prevEntry) {
        added.push(row.path);
      } else if (
        prevEntry.version !== undefined &&
        prevEntry.version !== row.version
      ) {
        modified.push(row.path);
      }
    }

    const deleted = Object.keys(prev).filter((p) => !currentPaths.has(p));
    return { added, modified, deleted };
  }

  private async computeDiff(
    projectId: string,
    _userId: string,
    snapshot: unknown
  ): Promise<SyncDiff> {
    const { added, modified, deleted } = await this.computeChangedPaths(
      projectId,
      snapshot
    );

    // Fetch content only for the files that actually changed.
    const changedPaths = [...added, ...modified];
    const contents = changedPaths.length
      ? await prisma.file.findMany({
          where: { projectId, path: { in: changedPaths } },
          select: { path: true, content: true },
        })
      : [];
    const byPath = new Map(contents.map((c) => [c.path, c.content]));

    return {
      added: added.map((path) => ({ path, content: byPath.get(path) ?? "" })),
      modified: modified.map((path) => ({
        path,
        content: byPath.get(path) ?? "",
      })),
      deleted,
    };
  }

  private async buildFileSnapshot(projectId: string): Promise<FileSnapshot> {
    const nodes = await prisma.file.findMany({
      where: { projectId },
      select: { path: true, version: true },
    });
    const snapshot: FileSnapshot = {};
    for (const f of nodes) {
      snapshot[f.path] = { version: f.version };
    }
    return snapshot;
  }
}

export const githubSyncService = new GithubSyncService();
