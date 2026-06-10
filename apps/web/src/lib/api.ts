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

  /** Fetches all cursor pages for backward-compatible full lists. */
  private async fetchAllCursorPages<T>(
    buildPath: (cursor?: string) => string
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<{
        data: T[];
        nextCursor?: string | null;
      }>(buildPath(cursor));
      all.push(...res.data);
      cursor = res.nextCursor ?? undefined;
    } while (cursor);
    return all;
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
        creditsRemaining?: number;
        status?: string;
      } | null;
      billing?: {
        plan: string;
        creditsRemaining: number;
        limits: {
          monthlyProjects: number | null;
          dailyAiRequests: number | null;
          dailyPreviews: number | null;
        };
        usage: {
          projectsThisMonth: number;
          aiRequestsToday: number;
          previewsToday: number;
        };
      };
    }>("/auth/me");
  }

  getBillingStatus() {
    return this.request<{
      data: {
        plan: string;
        status: string;
        creditsRemaining: number;
        renewsAt: string | null;
        priorityQueue: boolean;
        limits: {
          monthlyProjects: number | null;
          dailyAiRequests: number | null;
          dailyPreviews: number | null;
          monthlyCredits: number | null;
        };
        usage: {
          projectsThisMonth: number;
          aiRequestsToday: number;
          previewsToday: number;
          buildsUsedThisPeriod: number;
        };
      };
    }>("/billing/status");
  }

  getBillingUsage() {
    return this.request<{
      data: Array<{
        id: string;
        eventType: string;
        creditsConsumed: number;
        projectId: string | null;
        createdAt: string;
      }>;
    }>("/billing/usage");
  }

  getAdminBilling() {
    return this.request<{
      data: {
        estimatedRevenueUsd: number;
        activeSubscriptions: number;
        proSubscriptions: number;
        freeSubscriptions: number;
        totalCreditsConsumed: number;
        usageThisMonth: number;
        usageToday: number;
        quotaExceededEvents: number;
        usageByType: Array<{
          eventType: string;
          count: number;
          creditsConsumed: number;
        }>;
        recentLedger: Array<{
          id: string;
          userId: string;
          type: string;
          amount: number;
          balanceAfter: number;
          createdAt: string;
        }>;
        pendingUpgrades: Array<{
          id: string;
          userId: string;
          userEmail: string;
          userName: string;
          requestedPlan: string;
          status: string;
          notes: string | null;
          createdAt: string;
        }>;
      };
    }>("/admin/billing");
  }

  getSupportNotifications() {
    return this.request<{
      data: { unreadMessages: number; pendingUpgrade: boolean };
    }>("/support/notifications");
  }

  getSupportConversation() {
    return this.request<{
      data: {
        id: string;
        messages: Array<{
          id: string;
          senderType: string;
          message: string;
          createdAt: string;
        }>;
      };
    }>("/support/conversation");
  }

  sendSupportMessage(message: string) {
    return this.request<{
      data: {
        id: string;
        senderType: string;
        message: string;
        createdAt: string;
      };
    }>("/support/messages", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  requestProUpgrade() {
    return this.request<{
      data: {
        upgradeRequest: {
          id: string;
          status: string;
          requestedPlan: string;
          createdAt: string;
        };
        conversation: {
          id: string;
          messages: Array<{
            id: string;
            senderType: string;
            message: string;
            createdAt: string;
          }>;
        };
        alreadyPending: boolean;
      };
    }>("/support/upgrade-request", { method: "POST" });
  }

  getAdminSupportNotifications() {
    return this.request<{
      data: { unreadMessages: number; pendingUpgrades: number };
    }>("/admin/support/notifications");
  }

  getAdminSupportConversations() {
    return this.request<{
      data: Array<{
        id: string;
        userId: string;
        userEmail: string;
        userName: string;
        status: string;
        unreadCount: number;
        lastMessage: {
          message: string;
          senderType: string;
          createdAt: string;
        } | null;
        updatedAt: string;
      }>;
    }>("/admin/support/conversations");
  }

  getAdminSupportConversation(conversationId: string) {
    return this.request<{
      data: {
        id: string;
        userId: string;
        userEmail?: string;
        userName?: string;
        messages: Array<{
          id: string;
          senderType: string;
          message: string;
          createdAt: string;
        }>;
      };
    }>(`/admin/support/conversations/${conversationId}`);
  }

  sendAdminSupportMessage(conversationId: string, message: string) {
    return this.request<{
      data: {
        id: string;
        senderType: string;
        message: string;
        createdAt: string;
      };
    }>(`/admin/support/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  approveUpgradeRequest(requestId: string, notes?: string) {
    return this.request<{ data: { id: string; status: string } }>(
      `/admin/upgrade-requests/${requestId}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ notes }),
      }
    );
  }

  rejectUpgradeRequest(requestId: string, notes?: string) {
    return this.request<{ data: { id: string; status: string } }>(
      `/admin/upgrade-requests/${requestId}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ notes }),
      }
    );
  }

  async listProjects(opts?: { workspaceId?: string; scope?: "personal" | "all" }) {
    const base = new URLSearchParams();
    if (opts?.workspaceId) base.set("workspaceId", opts.workspaceId);
    if (opts?.scope) base.set("scope", opts.scope);
    const prefix = base.toString();
    const data = await this.fetchAllCursorPages<{
      id: string;
      name: string;
      slug: string;
      prompt: string;
      status: string;
      previewUrl: string | null;
      buildCount: number;
      workspaceId: string | null;
      visibility: string;
      createdAt: string;
    }>((cursor) => {
      const q = new URLSearchParams(prefix);
      if (cursor) q.set("cursor", cursor);
      const suffix = q.toString() ? `?${q}` : "";
      return `/projects${suffix}`;
    });
    return { data };
  }

  createProject(name: string, prompt: string, workspaceId?: string) {
    return this.request<{
      id: string;
      name: string;
      slug: string;
      prompt: string;
      status: string;
    }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, prompt, workspaceId }),
    });
  }

  listWorkspaces() {
    return this.request<{
      data: Array<{
        id: string;
        name: string;
        slug: string;
        ownerId: string;
        plan: string;
        role: string;
        membersCount: number;
        projectsCount: number;
        createdAt: string;
      }>;
    }>("/workspaces");
  }

  createWorkspace(name: string) {
    return this.request<{
      data: {
        id: string;
        name: string;
        slug: string;
        plan: string;
      };
    }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  getWorkspace(id: string) {
    return this.request<{
      data: {
        id: string;
        name: string;
        slug: string;
        ownerId: string;
        plan: string;
        role: string;
        membersCount: number;
        projectsCount: number;
        members: Array<{
          id: string;
          userId: string;
          name: string;
          email: string;
          role: string;
          createdAt: string;
        }>;
        invitations: Array<{
          id: string;
          email: string;
          role: string;
          status: string;
          expiresAt: string;
        }>;
      };
    }>(`/workspaces/${id}`);
  }

  updateWorkspace(id: string, name: string) {
    return this.request<{ data: { id: string; name: string } }>(`/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  }

  deleteWorkspace(id: string) {
    return this.request<void>(`/workspaces/${id}`, { method: "DELETE" });
  }

  transferWorkspaceOwnership(id: string, newOwnerUserId: string) {
    return this.request<{ data: { ok: boolean } }>(`/workspaces/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ newOwnerUserId }),
    });
  }

  inviteWorkspaceMember(id: string, email: string, role: "admin" | "member" = "member") {
    return this.request<{
      data: { id: string; email: string; role: string; token: string; expiresAt: string };
    }>(`/workspaces/${id}/invite`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  }

  acceptWorkspaceInvite(id: string, token: string) {
    return this.request<{ data: { ok: boolean; role: string } }>(
      `/workspaces/${id}/accept`,
      { method: "POST", body: JSON.stringify({ token }) }
    );
  }

  updateWorkspaceMemberRole(workspaceId: string, memberId: string, role: "admin" | "member") {
    return this.request<{ data: { id: string; role: string } }>(
      `/workspaces/${workspaceId}/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify({ role }) }
    );
  }

  removeWorkspaceMember(workspaceId: string, memberId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/workspaces/${workspaceId}/members/${memberId}`,
      { method: "DELETE" }
    );
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
      workspaceId: string | null;
    }>(`/projects/${id}`);
  }

  deleteProject(id: string) {
    return this.request<void>(`/projects/${id}`, { method: "DELETE" });
  }

  async listMessages(projectId: string) {
    const data = await this.fetchAllCursorPages<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>((cursor) => {
      const suffix = cursor
        ? `?cursor=${encodeURIComponent(cursor)}`
        : "";
      return `/projects/${projectId}/messages${suffix}`;
    });
    return { data };
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

  async listFiles(projectId: string) {
    const data = await this.fetchAllCursorPages<{
      path: string;
      version: number;
      createdAt: string;
    }>((cursor) => {
      const suffix = cursor
        ? `?cursor=${encodeURIComponent(cursor)}`
        : "";
      return `/projects/${projectId}/files${suffix}`;
    });
    return { data };
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
        phase?: string;
        previewUrl: string | null;
        detectedPort?: number | null;
        framework?: string | null;
        packageManager?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        sandboxId: string | null;
        createdAt: string;
        updatedAt: string;
        expiresAt: string | null;
        startedAt?: string | null;
      } | null;
    }>(`/projects/${projectId}/preview`);
  }

  createPreview(projectId: string) {
    return this.request<{
      status: string;
      previewId: string;
      message: string;
    }>("/previews/create", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
  }

  getPreviewStatus(previewId: string) {
    return this.request<{
      data: {
        id: string;
        projectId: string;
        status: string;
        phase: string;
        previewUrl: string | null;
        detectedPort: number | null;
        framework: string | null;
        packageManager: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        sandboxId: string | null;
        expiresAt: string | null;
        startedAt: string | null;
        updatedAt: string;
      };
    }>(`/previews/${previewId}/status`);
  }

  getPreviewLogs(previewId: string, since?: string) {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    return this.request<{
      data: Array<{
        id: string;
        previewId: string;
        level: string;
        source: string;
        message: string;
        createdAt: string;
      }>;
    }>(`/previews/${previewId}/logs${q}`);
  }

  startPreview(projectId: string) {
    return this.createPreview(projectId);
  }

  deletePreview(projectId: string) {
    return this.request<void>(`/projects/${projectId}/preview`, {
      method: "DELETE",
    });
  }

  deletePreviewById(previewId: string) {
    return this.request<void>(`/previews/${previewId}`, {
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
      data: {
        connected: boolean;
        username?: string;
        connectedAt?: string;
        tokenType?: string;
        oauthConfigured?: boolean;
      };
    }>("/github/connection");
  }

  getGithubStatus() {
    return this.request<{
      data: {
        oauthConfigured: boolean;
        connected: boolean;
        username: string | null;
        tokenType: string | null;
        connectedAt: string | null;
      };
    }>("/github/status");
  }

  getGithubConnectUrl() {
    const token = this.getToken();
    const base = API_URL.replace(/\/v1$/, "");
    return token
      ? `${base}/v1/github/connect?token=${encodeURIComponent(token)}`
      : null;
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
    return this.request<void>("/github/disconnect", { method: "POST" });
  }

  getGithubProjectStatus(projectId: string) {
    return this.request<{
      data: {
        connected: boolean;
        username: string | null;
        oauthConfigured: boolean;
        repository: {
          repositoryName: string;
          repositoryUrl: string;
          defaultBranch: string;
          lastCommitSha: string | null;
          lastSyncedAt: string | null;
          createdAt: string;
        } | null;
        syncAvailable: boolean;
        changedFileCount: number;
      };
    }>(`/projects/${projectId}/github/status`);
  }

  createGithubRepository(projectId: string) {
    return this.request<{
      data: {
        repositoryUrl: string;
        defaultBranch: string;
        commitSha: string;
      };
    }>(`/projects/${projectId}/github/create`, { method: "POST" });
  }

  syncGithubRepository(projectId: string) {
    return this.request<{
      data: {
        repositoryUrl: string;
        defaultBranch: string;
        commitSha: string | null;
        changedFiles: number;
      };
    }>(`/projects/${projectId}/github/sync`, { method: "POST" });
  }

  getGithubExport(projectId: string) {
    return this.request<{
      data: {
        repoUrl: string;
        repoFullName: string | null;
        exportedAt: string | null;
        lastCommitSha?: string | null;
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

  getAdminGithub() {
    return this.request<{
      data: {
        connectedAccounts: number;
        repositoriesCreated: number;
        exportSuccessRate: number;
        exportFailures: number;
        syncSuccesses: number;
        createSuccesses: number;
        oauthConfigured: boolean;
        recentConnections: Array<{
          id: string;
          username: string;
          githubUserId: string | null;
          tokenType: string;
          userEmail: string;
          connectedAt: string;
        }>;
        recentRepositories: Array<{
          id: string;
          repositoryName: string;
          repositoryUrl: string;
          projectName: string;
          lastCommitSha: string | null;
          lastSyncedAt: string | null;
          createdAt: string;
        }>;
        recentFailures: Array<{
          id: string;
          message: string | null;
          userId: string;
          projectId: string | null;
          createdAt: string;
        }>;
      };
    }>("/admin/github");
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

  getAdminMe() {
    return this.request<{
      data: {
        isAdmin: boolean;
        email: string;
        name: string | null;
        userId: string;
        adminConfigured: boolean;
      };
    }>("/admin/me");
  }

  getAdminOverview() {
    return this.request<{
      data: {
        totalUsers: number;
        activeUsers: number;
        totalProjects: number;
        projectsCreatedToday: number;
        totalBuilds: number;
        successfulBuilds: number;
        failedBuilds: number;
        buildSuccessRate: number;
        buildFailureRate: number;
        activePreviews: number;
        previewFailures: number;
        monthlyAiRequests: number;
        readyProjects: number;
        failedProjects: number;
        githubExports: number;
        estimatedAiCostUsd: number;
        trends?: {
          projectsToday?: { changePercent: number | null; direction: string };
          monthlyAiRequests?: { changePercent: number | null; direction: string };
        };
      };
    }>("/admin/dashboard/overview");
  }

  getAdminUsersPaginated(opts: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}) {
    const q = new URLSearchParams();
    if (opts.page) q.set("page", String(opts.page));
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.search) q.set("search", opts.search);
    if (opts.status) q.set("status", opts.status);
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        items: Array<{
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
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(`/admin/users${suffix}`);
  }

  getAdminUser(userId: string) {
    return this.request<{
      data: {
        id: string;
        name: string;
        email: string;
        plan: string;
        status: string;
        buildsUsed: number;
        buildsLimit: number;
        projectsCount: number;
        agentRuns: number;
        activity: {
          lastLoginAt: string | null;
          memberSince: string | null;
          projectsCreated: number;
          previewsLaunched: number;
          exportsPerformed: number;
        };
        projects: Array<{
          id: string;
          name: string;
          status: string;
          buildCount: number;
          createdAt: string;
        }>;
        buildStats: Array<{ status: string; count: number }>;
        createdAt: string;
      };
    }>(`/admin/users/${userId}`);
  }

  getAdminUsers() {
    return this.getAdminUsersPaginated();
  }

  getAdminProjects(opts: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}) {
    const q = new URLSearchParams();
    if (opts.page) q.set("page", String(opts.page));
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.search) q.set("search", opts.search);
    if (opts.status) q.set("status", opts.status);
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        items: Array<{
          id: string;
          name: string;
          status: string;
          ownerName: string;
          ownerEmail: string;
          filesCount: number;
          buildsCount: number;
          previewStatus: string | null;
          createdAt: string;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(`/admin/projects${suffix}`);
  }

  deleteAdminProject(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}`,
      { method: "DELETE" }
    );
  }

  forceRebuildProject(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}/force-rebuild`,
      { method: "POST" }
    );
  }

  forcePreviewRestart(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}/force-preview-restart`,
      { method: "POST" }
    );
  }

  getAdminBuildAnalytics() {
    return this.request<{
      data: {
        summary: {
          totalBuilds: number;
          successfulBuilds: number;
          failedBuilds: number;
          successRate: number;
          failureRate: number;
          averageBuildDurationMs: number | null;
        };
        buildsPerDay: Array<{
          date: string;
          total: number;
          success: number;
          failed: number;
          avgDurationMs: number | null;
        }>;
        topErrors: Array<{ code: string; count: number }>;
        buildsByProvider: Array<{
          provider: string;
          total: number;
          successful: number;
          failed: number;
        }>;
      };
    }>("/admin/builds/analytics");
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
        phase: string;
        previewUrl: string | null;
        sandboxId: string | null;
        sandboxAgeMinutes: number | null;
        errorCode: string | null;
        estimatedCostUsd: number | null;
        expiresAt: string | null;
      }>;
    }>("/admin/previews");
  }

  restartAdminPreview(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/previews/${projectId}/restart`,
      { method: "POST" }
    );
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

  getAdminAiUsage() {
    return this.request<{
      data: {
        currentProvider: string;
        configured: boolean;
        totalRequests: number;
        totalFailed: number;
        totalTokensInput: number;
        totalTokensOutput: number;
        estimatedCostUsd: number;
        providerBreakdown: Array<{
          provider: string;
          requests: number;
          failed: number;
          tokensIn: number;
          tokensOut: number;
          estimatedCostUsd: number;
        }>;
        dailyTokenUsage: Array<{
          date: string;
          requests: number;
          tokensInput: number;
          tokensOutput: number;
        }>;
        deepseek: { requests: number; failed: number };
        anthropic: { requests: number; failed: number };
      };
    }>("/admin/ai");
  }

  getAdminSystem() {
    return this.request<{
      data: {
        checkedAt: string;
        overall: string;
        services: Array<{
          service: string;
          status: string;
          latencyMs: number | null;
          lastCheck: string;
        }>;
        backup?: {
          databaseReachable: boolean;
          lastMetricCheck: string | null;
        };
        rateLimits?: Record<string, number>;
      };
    }>("/admin/system");
  }

  submitFeedback(category: string, message: string) {
    return this.request<{
      data: { id: string; category: string; status: string; createdAt: string };
    }>("/feedback", {
      method: "POST",
      body: JSON.stringify({ category, message }),
    });
  }

  getAdminErrors(opts: {
    page?: number;
    limit?: number;
    search?: string;
    source?: string;
  } = {}) {
    const q = new URLSearchParams();
    if (opts.page) q.set("page", String(opts.page));
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.search) q.set("search", opts.search);
    if (opts.source) q.set("source", opts.source);
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        events: {
          items: Array<{
            id: string;
            source: string;
            code: string;
            message: string;
            userId: string | null;
            userEmail: string | null;
            projectId: string | null;
            createdAt: string;
          }>;
          total: number;
          page: number;
          totalPages: number;
        };
        stats: {
          totalEvents: number;
          last24h: number;
          bySource: Array<{ source: string; count: number }>;
          topErrors: Array<{
            id: string;
            source: string;
            code: string;
            message: string;
            count: number;
            lastSeenAt: string;
          }>;
        };
      };
    }>(`/admin/errors${suffix}`);
  }

  getAdminFeedback(opts: { page?: number; limit?: number; status?: string } = {}) {
    const q = new URLSearchParams();
    if (opts.page) q.set("page", String(opts.page));
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.status) q.set("status", opts.status);
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        items: Array<{
          id: string;
          userId: string;
          userEmail: string;
          userName: string;
          category: string;
          message: string;
          status: string;
          createdAt: string;
        }>;
        total: number;
        page: number;
        totalPages: number;
      };
    }>(`/admin/feedback${suffix}`);
  }

  updateAdminFeedbackStatus(feedbackId: string, status: string) {
    return this.request<{ data: { id: string; status: string } }>(
      `/admin/feedback/${feedbackId}`,
      { method: "PATCH", body: JSON.stringify({ status }) }
    );
  }

  retryAdminBuild(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}/retry-build`,
      { method: "POST" }
    );
  }

  retryAdminPreview(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}/retry-preview`,
      { method: "POST" }
    );
  }

  retryAdminGithubSync(projectId: string) {
    return this.request<{ data: { ok: boolean } }>(
      `/admin/projects/${projectId}/retry-github-sync`,
      { method: "POST" }
    );
  }

  getAdminAudit(opts: { page?: number; limit?: number; search?: string } = {}) {
    const q = new URLSearchParams();
    if (opts.page) q.set("page", String(opts.page));
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.search) q.set("search", opts.search);
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        items: Array<{
          id: string;
          action: string;
          adminEmail: string;
          targetType: string | null;
          targetLabel: string | null;
          createdAt: string;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(`/admin/audit${suffix}`);
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

  // --- Project platform features ---

  listProjectEnvVars(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        key: string;
        value: string;
        environment: string;
        isSecret: boolean;
      }>;
    }>(`/projects/${projectId}/env-vars`);
  }

  createProjectEnvVar(
    projectId: string,
    input: { key: string; value: string; environment?: string }
  ) {
    return this.request<{ data: { id: string; key: string; value: string } }>(
      `/projects/${projectId}/env-vars`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  deleteProjectEnvVar(projectId: string, envVarId: string) {
    return this.request<void>(`/projects/${projectId}/env-vars/${envVarId}`, {
      method: "DELETE",
    });
  }

  listProjectDomains(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        host: string;
        status: string;
        createdAt: string;
      }>;
    }>(`/projects/${projectId}/domains`);
  }

  addProjectDomain(projectId: string, host: string) {
    return this.request<{ data: { id: string; host: string; status: string } }>(
      `/projects/${projectId}/domains`,
      { method: "POST", body: JSON.stringify({ host }) }
    );
  }

  removeProjectDomain(projectId: string, domainId: string) {
    return this.request<void>(`/projects/${projectId}/domains/${domainId}`, {
      method: "DELETE",
    });
  }

  verifyProjectDomain(projectId: string, domainId: string) {
    return this.request<{ data: { id: string; host: string; status: string } }>(
      `/projects/${projectId}/domains/${domainId}/verify`,
      { method: "POST" }
    );
  }

  listProjectNotes(projectId: string, opts?: { q?: string; page?: number }) {
    const q = new URLSearchParams();
    if (opts?.q) q.set("q", opts.q);
    if (opts?.page !== undefined) q.set("page", String(opts.page));
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        rows: Array<{
          id: string;
          title: string;
          content: string;
          tags: string[];
          createdAt: string;
          updatedAt: string;
        }>;
        count: number;
        page: number;
        pageSize: number;
      };
    }>(`/projects/${projectId}/notes${suffix}`);
  }

  saveProjectNote(
    projectId: string,
    input: { id?: string; title: string; content: string; tags?: string[] }
  ) {
    return this.request<{ data: { id: string } }>(
      `/projects/${projectId}/notes`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  deleteProjectNote(projectId: string, noteId: string) {
    return this.request<void>(`/projects/${projectId}/notes/${noteId}`, {
      method: "DELETE",
    });
  }

  listProjectRecordings(projectId: string, opts?: { q?: string; page?: number }) {
    const q = new URLSearchParams();
    if (opts?.q) q.set("q", opts.q);
    if (opts?.page !== undefined) q.set("page", String(opts.page));
    const suffix = q.toString() ? `?${q}` : "";
    return this.request<{
      data: {
        rows: Array<{
          id: string;
          title: string;
          durationSeconds: number;
          transcript: string;
          createdAt: string;
        }>;
        count: number;
        page: number;
        pageSize: number;
      };
    }>(`/projects/${projectId}/recordings${suffix}`);
  }

  saveProjectRecording(
    projectId: string,
    input: {
      id?: string;
      title: string;
      durationSeconds?: number;
      transcript?: string;
    }
  ) {
    return this.request<{ data: { id: string } }>(
      `/projects/${projectId}/recordings`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  deleteProjectRecording(projectId: string, recordingId: string) {
    return this.request<void>(
      `/projects/${projectId}/recordings/${recordingId}`,
      { method: "DELETE" }
    );
  }

  listProjectDeployments(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        status: string;
        target: string;
        url: string | null;
        commitMessage: string | null;
        branch: string;
        logs: unknown;
        error: string | null;
        createdAt: string;
      }>;
    }>(`/projects/${projectId}/deployments`);
  }

  createProjectDeployment(
    projectId: string,
    input?: { target?: "vercel" | "netlify" | "mock"; commitMessage?: string }
  ) {
    return this.request<{ data: { deploymentId: string } }>(
      `/projects/${projectId}/deployments`,
      { method: "POST", body: JSON.stringify(input ?? {}) }
    );
  }

  getProjectDeployment(projectId: string, deploymentId: string) {
    return this.request<{
      data: {
        id: string;
        status: string;
        target: string;
        url: string | null;
        logs: unknown;
        error: string | null;
      };
    }>(`/projects/${projectId}/deployments/${deploymentId}`);
  }

  listProjectPlatformLogs(projectId: string) {
    return this.request<{
      data: Array<{
        t: string;
        level: string;
        msg: string;
        deployment: string;
      }>;
    }>(`/projects/${projectId}/platform-logs`);
  }

  getProjectTeam(projectId: string) {
    return this.request<{
      data: {
        id?: string;
        name?: string;
        slug?: string;
        role?: string;
        members?: Array<{
          id: string;
          userId: string;
          name: string;
          email: string;
          role: string;
        }>;
        invitations?: Array<{
          id: string;
          email: string;
          role: string;
        }>;
      } | null;
    }>(`/projects/${projectId}/team`);
  }
}

export const api = new ApiClient();
