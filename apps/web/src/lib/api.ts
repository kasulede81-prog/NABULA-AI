const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export interface ApiError {
  error: { code: string; message: string };
}

export class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("nebula_token", token);
      else localStorage.removeItem("nebula_token");
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      return localStorage.getItem("nebula_token");
    }
    return null;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) throw data as ApiError;
    return data as T;
  }

  register(email: string, password: string, name: string) {
    return this.request<{
      user: { id: string; email: string; name: string };
      token: string;
      expiresAt: string;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  }

  login(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string; name: string };
      token: string;
      expiresAt: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  logout() {
    return this.request<void>("/auth/logout", { method: "POST" });
  }

  me() {
    return this.request<{
      id: string;
      email: string;
      name: string;
      subscription: {
        plan: string;
        buildsUsed: number;
        buildsLimit: number;
      } | null;
    }>("/auth/me");
  }

  listProjects() {
    return this.request<{
      data: Array<{
        id: string;
        name: string;
        slug: string;
        prompt: string;
        status: string;
        previewUrl: string | null;
        buildCount: number;
        createdAt: string;
      }>;
    }>("/projects");
  }

  createProject(name: string, prompt: string) {
    return this.request<{
      id: string;
      name: string;
      slug: string;
      prompt: string;
      status: string;
    }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, prompt }),
    });
  }

  getProject(id: string) {
    return this.request<{
      id: string;
      name: string;
      slug: string;
      prompt: string;
      status: string;
      previewUrl: string | null;
      buildCount: number;
    }>(`/projects/${id}`);
  }

  deleteProject(id: string) {
    return this.request<void>(`/projects/${id}`, { method: "DELETE" });
  }

  listMessages(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        role: string;
        content: string;
        createdAt: string;
      }>;
    }>(`/projects/${projectId}/messages`);
  }

  sendMessage(projectId: string, content: string) {
    return this.request<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>(`/projects/${projectId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  listFiles(projectId: string) {
    return this.request<{
      data: Array<{ path: string; version: number; createdAt: string }>;
    }>(`/projects/${projectId}/files`);
  }

  readFile(projectId: string, path: string) {
    return this.request<{
      path: string;
      content: string;
      version: number;
    }>(`/projects/${projectId}/files/${path}`);
  }

  writeFile(projectId: string, path: string, content: string) {
    return this.request<{
      path: string;
      version: number;
    }>(`/projects/${projectId}/files`, {
      method: "POST",
      body: JSON.stringify({ path, content }),
    });
  }

  deleteFile(projectId: string, path: string) {
    return this.request<{ path: string }>(
      `/projects/${projectId}/files/${path}`,
      { method: "DELETE" }
    );
  }

  triggerBuild(projectId: string, message?: string) {
    return this.request<{
      phase: string;
      fileCount?: number;
    }>(`/projects/${projectId}/build`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  triggerClarify(projectId: string) {
    return this.request<{
      ready: boolean;
      questions?: Array<{ id: string; text: string }>;
    }>(`/projects/${projectId}/clarify`, {
      method: "POST",
    });
  }

  getPreview(projectId: string) {
    return this.request<{
      data: {
        id: string;
        projectId: string;
        status: string;
        previewUrl: string | null;
        sandboxId: string | null;
        createdAt: string;
        updatedAt: string;
        expiresAt: string | null;
      } | null;
    }>(`/projects/${projectId}/preview`);
  }

  startPreview(projectId: string) {
    return this.request<{ status: string; message: string }>(
      `/projects/${projectId}/preview`,
      { method: "POST" }
    );
  }

  deletePreview(projectId: string) {
    return this.request<void>(`/projects/${projectId}/preview`, {
      method: "DELETE",
    });
  }

  triggerRun(projectId: string, message?: string) {
    return this.request<{ status: string; message: string }>(
      `/projects/${projectId}/run`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      }
    );
  }

  getGithubConnection() {
    return this.request<{
      data: { connected: boolean; username?: string; connectedAt?: string };
    }>("/github/connection");
  }

  connectGithub(token: string) {
    return this.request<{
      data: { connected: boolean; username: string };
    }>("/github/connection", {
      method: "PUT",
      body: JSON.stringify({ token }),
    });
  }

  disconnectGithub() {
    return this.request<void>("/github/connection", { method: "DELETE" });
  }

  getGithubExport(projectId: string) {
    return this.request<{
      data: {
        repoUrl: string;
        repoFullName: string | null;
        exportedAt: string | null;
      } | null;
    }>(`/projects/${projectId}/github/export`);
  }

  exportToGithub(projectId: string) {
    return this.request<{
      data: {
        repoUrl: string;
        repoFullName: string;
        commitSha: string;
        exportedAt: string;
      };
    }>(`/projects/${projectId}/github/export`, { method: "POST" });
  }

  renameFile(projectId: string, fromPath: string, toPath: string) {
    return this.request<{
      fromPath: string;
      path: string;
      version: number;
    }>(`/projects/${projectId}/files/rename`, {
      method: "PATCH",
      body: JSON.stringify({ fromPath, toPath }),
    });
  }

  proposeAiEdit(projectId: string, path: string, instruction: string) {
    return this.request<{
      data: {
        path: string;
        originalContent: string;
        modifiedContent: string;
        tokensInput: number;
        tokensOutput: number;
      };
    }>(`/projects/${projectId}/files/ai-edit`, {
      method: "POST",
      body: JSON.stringify({ path, instruction }),
    });
  }

  applyAiEdit(projectId: string, path: string, content: string) {
    return this.request<{ path: string; version: number }>(
      `/projects/${projectId}/files/ai-edit/apply`,
      {
        method: "POST",
        body: JSON.stringify({ path, content }),
      }
    );
  }

  getBuildAnalytics() {
    return this.request<{
      data: {
        totalBuilds: number;
        successfulBuilds: number;
        failedBuilds: number;
        successRate: number;
        averageBuildDurationMs: number | null;
        averageTokensInput: number;
        averageTokensOutput: number;
        averageEstimatedCostUsd: number | null;
        topFailureCodes: Array<{ code: string; count: number }>;
        topFailurePhases: Array<{ phase: string; count: number }>;
        buildsByProvider: Array<{
          provider: string;
          total: number;
          successful: number;
          failed: number;
        }>;
        workspaceMetrics: {
          filesOpened: number;
          filesSaved: number;
          aiEditsRequested: number;
          aiEditsApplied: number;
        };
      };
    }>("/admin/analytics/builds");
  }

  getAdminOverview() {
    return this.request<{
      data: {
        totalUsers: number;
        totalProjects: number;
        readyProjects: number;
        failedProjects: number;
        activePreviews: number;
        githubExports: number;
        estimatedAiCostUsd: number;
      };
    }>("/admin/dashboard/overview");
  }

  getAdminUsers() {
    return this.request<{
      data: Array<{
        id: string;
        name: string;
        email: string;
        plan: string;
        projectsCount: number;
        buildsUsed: number;
        buildsLimit: number;
        status: string;
        createdAt: string;
      }>;
    }>("/admin/users");
  }

  suspendUser(userId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/users/${userId}/suspend`,
      { method: "POST" }
    );
  }

  reactivateUser(userId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/users/${userId}/reactivate`,
      { method: "POST" }
    );
  }

  upgradeUserToPro(userId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/users/${userId}/upgrade-pro`,
      { method: "POST" }
    );
  }

  resetUserBuildLimits(userId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/users/${userId}/reset-build-limits`,
      { method: "POST" }
    );
  }

  getAdminBuilds(status: "ready" | "failed" | "building" | "all" = "all") {
    const q = status === "all" ? "" : `?status=${status}`;
    return this.request<{
      data: Array<{
        id: string;
        userName: string;
        userEmail: string;
        projectName: string;
        projectStatus: string;
        provider: string;
        status: string;
        durationMs: number | null;
        tokensInput: number;
        tokensOutput: number;
        estimatedCostUsd: number | null;
        createdAt: string;
      }>;
    }>(`/admin/builds${q}`);
  }

  getAdminPreviews() {
    return this.request<{
      data: Array<{
        id: string;
        projectId: string;
        projectName: string;
        userName: string;
        userEmail: string;
        status: string;
        sandboxId: string | null;
        estimatedCostUsd: number | null;
        expiresAt: string | null;
      }>;
    }>("/admin/previews");
  }

  stopAdminPreview(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/previews/${projectId}/stop`,
      { method: "POST" }
    );
  }

  deleteAdminPreview(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/previews/${projectId}`,
      { method: "DELETE" }
    );
  }

  getAdminAiAnalytics() {
    return this.request<{
      data: {
        daily: Array<{
          date: string;
          builds: number;
          successful: number;
          failed: number;
          tokensInput: number;
          tokensOutput: number;
          costUsd: number;
          successRate: number;
        }>;
        summary: {
          totalBuilds: number;
          successRate: number;
          totalTokensInput: number;
          totalTokensOutput: number;
          totalCostUsd: number;
        };
      };
    }>("/admin/ai-analytics");
  }

  getAdminHealth() {
    return this.request<{
      data: {
        database: boolean;
        supabase: {
          configured: boolean;
          database: boolean;
          auth: boolean;
          storage: boolean;
        };
        deepseek: { configured: boolean; active: boolean; provider: string };
        github: { configured: boolean; dedicatedEncryptionKey: boolean };
        e2b: { configured: boolean; template: string };
      };
    }>("/admin/health");
  }

  getAdminAuditLogs() {
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        message: string;
        userEmail: string | null;
        projectName: string | null;
        createdAt: string;
      }>;
    }>("/admin/audit-logs");
  }
}

export const api = new ApiClient();
