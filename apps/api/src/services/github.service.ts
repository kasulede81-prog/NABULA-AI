import { prisma } from "../lib/prisma";
import { encryptSecret, decryptSecret } from "../lib/token-crypto";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";
import { eventService } from "./event.service";
import { SseEvents } from "@nebula/shared";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GithubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

interface GithubUser {
  login: string;
}

interface GithubRepo {
  html_url: string;
  full_name: string;
}

interface GithubBlob {
  sha: string;
}

interface GithubTree {
  sha: string;
}

interface GithubCommit {
  sha: string;
}

export class GithubService {
  async getConnection(userId: string) {
    const row = await prisma.githubConnection.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      username: row.username,
      connectedAt: row.createdAt.toISOString(),
    };
  }

  async connect(userId: string, token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new GithubError("INVALID_TOKEN", "GitHub token is required", 400);
    }

    const user = await this.fetchGithubUser(trimmed);

    await prisma.githubConnection.upsert({
      where: { userId },
      create: {
        userId,
        tokenEnc: encryptSecret(trimmed),
        username: user.login,
      },
      update: {
        tokenEnc: encryptSecret(trimmed),
        username: user.login,
      },
    });

    return { username: user.login };
  }

  async disconnect(userId: string) {
    await prisma.githubConnection.deleteMany({ where: { userId } });
  }

  async getExport(projectId: string, userId: string) {
    const project = await projectService.get(projectId, userId);
    if (!project.githubRepoUrl) return null;
    return {
      repoUrl: project.githubRepoUrl,
      repoFullName: project.githubRepoFullName,
      exportedAt: project.githubExportedAt?.toISOString() ?? null,
    };
  }

  async exportProject(projectId: string, userId: string) {
    const project = await projectService.get(projectId, userId);

    if (project.status !== "ready") {
      throw new GithubError(
        "PROJECT_NOT_READY",
        "Export is only available when project status is ready",
        422
      );
    }

    if (project.githubRepoUrl) {
      throw new GithubError(
        "ALREADY_EXPORTED",
        "This project has already been exported to GitHub",
        409
      );
    }

    const connection = await prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      throw new GithubError(
        "GITHUB_NOT_CONNECTED",
        "Connect a GitHub Personal Access Token first",
        401
      );
    }

    const token = decryptSecret(connection.tokenEnc);
    const files = await vfsService.snapshot(projectId, userId);
    if (files.length === 0) {
      throw new GithubError("NO_FILES", "Project has no files to export", 422);
    }

    eventService.publish(projectId, SseEvents.GITHUB_EXPORT_STARTED, {
      message: "Creating GitHub repository...",
    });

    try {
      const repoName = this.sanitizeRepoName(project.slug);
      const owner = connection.username;
      const repo = await this.createRepository(token, repoName, project.name);
      const commitSha = await this.pushInitialCommit(
        token,
        owner,
        repo.name,
        files
      );

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          githubRepoUrl: repo.html_url,
          githubRepoFullName: repo.full_name,
          githubExportedAt: new Date(),
        },
      });

      eventService.publish(projectId, SseEvents.GITHUB_EXPORT_COMPLETED, {
        repoUrl: updated.githubRepoUrl,
        repoFullName: updated.githubRepoFullName,
        commitSha,
      });

      return {
        repoUrl: updated.githubRepoUrl!,
        repoFullName: updated.githubRepoFullName!,
        commitSha,
        exportedAt: updated.githubExportedAt!.toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof GithubError
          ? err.message
          : err instanceof Error
            ? err.message
            : "GitHub export failed";

      eventService.publish(projectId, SseEvents.GITHUB_EXPORT_FAILED, {
        message,
        code: err instanceof GithubError ? err.code : "GITHUB_EXPORT_FAILED",
      });

      throw err instanceof GithubError
        ? err
        : new GithubError("GITHUB_EXPORT_FAILED", message, 500);
    }
  }

  private sanitizeRepoName(slug: string): string {
    const base = slug
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 90);
    return base || "nebula-app";
  }

  private async githubFetch<T>(
    path: string,
    token: string,
    init?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string>),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      let message = `GitHub API error (${res.status})`;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        if (body) message = body.slice(0, 200);
      }
      throw new GithubError("GITHUB_API_ERROR", message, res.status >= 500 ? 502 : 400);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async fetchGithubUser(token: string): Promise<GithubUser> {
    try {
      return await this.githubFetch<GithubUser>("/user", token);
    } catch (err) {
      if (err instanceof GithubError && err.status === 400) {
        throw new GithubError(
          "INVALID_TOKEN",
          "GitHub token is invalid or lacks required scopes",
          401
        );
      }
      throw err;
    }
  }

  private async createRepository(
    token: string,
    name: string,
    description: string
  ): Promise<GithubRepo & { name: string }> {
    try {
      return await this.githubFetch<GithubRepo & { name: string }>("/user/repos", token, {
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
        return this.createRepository(
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
      const blob = await this.githubFetch<GithubBlob>(
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

    const tree = await this.githubFetch<GithubTree>(
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

    const commit = await this.githubFetch<GithubCommit>(
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

    await this.githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({
        ref: "refs/heads/main",
        sha: commit.sha,
      }),
    });

    return commit.sha;
  }
}

export const githubService = new GithubService();
