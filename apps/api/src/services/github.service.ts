import { githubAuthService } from "./github/github-auth.service";
import { githubRepositoryService } from "./github/github-repository.service";
import { githubSyncService } from "./github/github-sync.service";
import { projectService } from "./project.service";

export { GithubError } from "./github/github-api";

/** Facade over GitHub Phase 3 modules (auth, repository, sync). */
export class GithubService {
  // --- Auth ---
  isOAuthConfigured() {
    return githubAuthService.isOAuthConfigured();
  }

  buildAuthorizeUrl(userId: string, apiBase: string) {
    return githubAuthService.buildAuthorizeUrl(userId, apiBase);
  }

  verifyOAuthState(state: string) {
    return githubAuthService.verifyState(state);
  }

  exchangeOAuthCode(code: string, redirectUri: string) {
    return githubAuthService.exchangeCodeForToken(code, redirectUri);
  }

  connectOAuth(userId: string, accessToken: string) {
    return githubAuthService.connectWithOAuth(userId, accessToken);
  }

  getConnection(userId: string) {
    return githubAuthService.getConnection(userId);
  }

  getStatus(userId: string) {
    return githubAuthService.getStatus(userId);
  }

  connect(userId: string, token: string) {
    return githubAuthService.connectWithPat(userId, token);
  }

  disconnect(userId: string) {
    return githubAuthService.disconnect(userId);
  }

  // --- Repository ---
  getProjectRepository(projectId: string, userId: string) {
    return githubRepositoryService.getProjectRepository(projectId, userId);
  }

  createRepository(projectId: string, userId: string) {
    return githubRepositoryService.createRepository(projectId, userId);
  }

  // --- Sync ---
  getSyncStatus(projectId: string, userId: string) {
    return githubSyncService.getSyncStatus(projectId, userId);
  }

  syncRepository(projectId: string, userId: string) {
    return githubSyncService.syncRepository(projectId, userId);
  }

  // --- Legacy aliases ---
  async getExport(projectId: string, userId: string) {
    const repo = await this.getProjectRepository(projectId, userId);
    if (repo) {
      return {
        repoUrl: repo.repositoryUrl,
        repoFullName: repo.repositoryName,
        exportedAt: repo.lastSyncedAt ?? repo.createdAt,
        lastCommitSha: repo.lastCommitSha,
      };
    }

    const project = await projectService.get(projectId, userId);
    if (project.githubRepoUrl) {
      return {
        repoUrl: project.githubRepoUrl,
        repoFullName: project.githubRepoFullName,
        exportedAt: project.githubExportedAt?.toISOString() ?? null,
        lastCommitSha: null,
      };
    }
    return null;
  }

  exportProject(projectId: string, userId: string) {
    return this.createRepository(projectId, userId).then((result) => ({
      repoUrl: result.repositoryUrl,
      repoFullName: result.repositoryUrl.split("/").slice(-2).join("/"),
      commitSha: result.commitSha,
      exportedAt: new Date().toISOString(),
      defaultBranch: result.defaultBranch,
    }));
  }
}

export const githubService = new GithubService();
