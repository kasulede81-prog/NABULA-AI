import { prisma } from "../../lib/prisma";
import { projectService } from "../project.service";
import { vfsService } from "../vfs.service";
import { eventService } from "../event.service";
import { SseEvents } from "@nebula/shared";
import {
  githubFetch,
  sanitizeRepoName,
  GithubError,
  type GithubRepo,
} from "./github-api";
import { githubAuthService } from "./github-auth.service";
import { githubAuditService } from "./github-audit.service";
import type { FileSnapshot } from "./github-sync.service";
import { GITHUB_CI_WORKFLOW } from "../../lib/github-ci-workflow";

function buildReadme(name: string, prompt: string): string {
  const excerpt = prompt.trim().slice(0, 500);
  return `# ${name}

${excerpt}

---

*Generated with [Nebula AI](https://nebula.ai)*
`;
}

export class GithubRepositoryService {
  async getProjectRepository(projectId: string, userId: string) {
    await projectService.get(projectId, userId);
    const repo = await prisma.githubRepository.findUnique({
      where: { projectId },
    });
    if (!repo) return null;

    return {
      repositoryName: repo.repositoryName,
      repositoryUrl: repo.repositoryUrl,
      defaultBranch: repo.defaultBranch,
      lastCommitSha: repo.lastCommitSha,
      lastSyncedAt: repo.lastSyncedAt?.toISOString() ?? null,
      createdByUserId: repo.createdByUserId,
      lastSyncedByUserId: repo.lastSyncedByUserId,
      createdAt: repo.createdAt.toISOString(),
    };
  }

  async createRepository(projectId: string, userId: string) {
    const project = await projectService.get(projectId, userId);

    if (project.status !== "ready") {
      throw new GithubError(
        "PROJECT_NOT_READY",
        "Repository creation requires project status ready",
        422
      );
    }

    const existing = await prisma.githubRepository.findUnique({
      where: { projectId },
    });
    if (existing) {
      throw new GithubError(
        "REPOSITORY_EXISTS",
        "A GitHub repository already exists for this project",
        409
      );
    }

    const { token, connection } = await githubAuthService.getDecryptedToken(userId);
    const files = await vfsService.snapshot(projectId, userId);
    if (files.length === 0) {
      throw new GithubError("NO_FILES", "Project has no files to push", 422);
    }

    const readmePath = "README.md";
    const hasReadme = files.some(
      (f) => f.path.toLowerCase() === readmePath.toLowerCase()
    );
    const ciPath = ".github/workflows/nebula-ci.yml";
    const withCi = files.some((f) => f.path === ciPath)
      ? files
      : [...files, { path: ciPath, content: GITHUB_CI_WORKFLOW }];
    const pushFiles = hasReadme
      ? withCi
      : [
          { path: readmePath, content: buildReadme(project.name, project.prompt) },
          ...withCi,
        ];

    eventService.publish(projectId, SseEvents.GITHUB_EXPORT_STARTED, {
      message: "Creating GitHub repository...",
    });

    try {
      const repoName = sanitizeRepoName(project.slug);
      const owner = connection.username;
      const repo = await this.createGithubRepo(token, repoName, project.name);
      const commitSha = await this.pushInitialCommit(
        token,
        owner,
        repo.name,
        pushFiles
      );

      const fileSnapshot = await this.buildFileSnapshot(projectId);

      const record = await prisma.githubRepository.create({
        data: {
          projectId,
          connectionId: connection.id,
          repositoryName: repo.full_name,
          repositoryUrl: repo.html_url,
          defaultBranch: repo.default_branch || "main",
          lastCommitSha: commitSha,
          lastSyncedAt: new Date(),
          fileSnapshot,
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: {
          githubRepoUrl: repo.html_url,
          githubRepoFullName: repo.full_name,
          githubExportedAt: new Date(),
        },
      });

      await githubAuditService.log({
        userId,
        projectId,
        action: "repository_created",
        metadata: {
          repositoryName: repo.full_name,
          commitSha,
        },
      });

      eventService.publish(projectId, SseEvents.GITHUB_EXPORT_COMPLETED, {
        repoUrl: record.repositoryUrl,
        repoFullName: record.repositoryName,
        commitSha,
      });

      return {
        repositoryUrl: record.repositoryUrl,
        defaultBranch: record.defaultBranch,
        commitSha,
      };
    } catch (err) {
      const message =
        err instanceof GithubError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Repository creation failed";

      eventService.publish(projectId, SseEvents.GITHUB_EXPORT_FAILED, {
        message,
        code: err instanceof GithubError ? err.code : "REPOSITORY_CREATE_FAILED",
      });

      throw err instanceof GithubError
        ? err
        : new GithubError("REPOSITORY_CREATE_FAILED", message, 500);
    }
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

  private async createGithubRepo(
    token: string,
    name: string,
    description: string
  ): Promise<GithubRepo> {
    try {
      return await githubFetch<GithubRepo>("/user/repos", token, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description.slice(0, 350),
          private: false,
          auto_init: false,
        }),
      });
    } catch (err) {
      if (err instanceof GithubError && err.message.includes("already exists")) {
        const suffix = Date.now().toString(36);
        return this.createGithubRepo(
          token,
          `${name}-${suffix}`.slice(0, 100),
          description
        );
      }
      throw err;
    }
  }

  private async pushInitialCommit(
    token: string,
    owner: string,
    repo: string,
    files: Array<{ path: string; content: string }>
  ): Promise<string> {
    const blobShas: string[] = [];
    for (const file of files) {
      const blob = await githubFetch<{ sha: string }>(
        `/repos/${owner}/${repo}/git/blobs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: file.content,
            encoding: "utf-8",
          }),
        }
      );
      blobShas.push(blob.sha);
    }

    const tree = await githubFetch<{ sha: string }>(
      `/repos/${owner}/${repo}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          tree: files.map((file, i) => ({
            path: file.path.replace(/\\/g, "/"),
            mode: "100644",
            type: "blob",
            sha: blobShas[i],
          })),
        }),
      }
    );

    const commit = await githubFetch<{ sha: string }>(
      `/repos/${owner}/${repo}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message: "Initial commit from Nebula AI",
          tree: tree.sha,
        }),
      }
    );

    await githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({
        ref: "refs/heads/main",
        sha: commit.sha,
      }),
    });

    return commit.sha;
  }

  async assertRepositoryOwnership(
    projectId: string,
    userId: string
  ): Promise<{
    repo: NonNullable<Awaited<ReturnType<typeof prisma.githubRepository.findUnique>>>;
    token: string;
    owner: string;
  }> {
    const repo = await prisma.githubRepository.findUnique({
      where: { projectId },
      include: { connection: true, project: true },
    });

    if (!repo) {
      throw new GithubError("REPOSITORY_NOT_FOUND", "No GitHub repository linked", 404);
    }

    await projectService.get(projectId, userId);

    const { token } = await githubAuthService.getDecryptedToken(repo.connection.userId);
    const owner = repo.connection.username;
    const expectedPrefix = `${owner}/`;
    if (!repo.repositoryName.startsWith(expectedPrefix)) {
      throw new GithubError(
        "FORBIDDEN",
        "Repository ownership validation failed",
        403
      );
    }

    return { repo, token, owner };
  }
}

export const githubRepositoryService = new GithubRepositoryService();
