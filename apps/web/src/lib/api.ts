const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" ? "/api" : "http://localhost:3001/v1");

export interface ApiError {
  error: { code: string; message: string };
}

/** Encode each segment of a VFS path for use in a URL (keeps `/` separators). */
function encodeFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
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

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (res.status === 204) return undefined as T;

    // Gateways/proxies can return HTML or empty bodies — surface those as
    // structured ApiErrors instead of raw JSON SyntaxErrors.
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (!res.ok) {
        throw {
          error: {
            code: "HTTP_ERROR",
            message: `Request failed with status ${res.status}`,
          },
        } satisfies ApiError;
      }
      throw {
        error: { code: "INVALID_RESPONSE", message: "Invalid server response" },
      } satisfies ApiError;
    }
    if (!res.ok) {
      // Fastify default error shape: { statusCode, code, message }
      const fastify = data as {
        error?: { code?: string; message?: string };
        message?: string;
        code?: string;
      };
      if (fastify.error?.message) throw data as ApiError;
      if (typeof fastify.message === "string") {
        throw {
          error: {
            code: fastify.code ?? "HTTP_ERROR",
            message: fastify.message,
          },
        } satisfies ApiError;
      }
      throw data as ApiError;
    }
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

  getOAuthConfig() {
    return this.request<{
      data: { google: string | null; github: string | null };
    }>("/auth/oauth/config");
  }

  exchangeSupabaseToken(accessToken: string) {
    return this.request<{
      user: { id: string; email: string; name: string };
      token: string;
      expiresAt: string;
    }>("/auth/supabase/exchange", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    });
  }

  getIntegrations() {
    return this.request<{
      data: {
        auth: { googleOAuth: boolean; githubOAuth: boolean };
        llm: {
          defaultProvider: string;
          providers: Record<string, boolean>;
        };
        preview: { e2b: boolean; autoPreview: boolean };
        deploy: { vercel: boolean; netlify: boolean };
        github: { oauth: boolean };
        billing: { stripe: boolean };
        observability: { sentry: boolean; posthog: boolean };
        email: { resend: boolean };
        infra: { redis: boolean; fileStorageBackend: string; supabaseStorage: boolean };
        agents: {
          reviewer: boolean;
          bugbot: boolean;
          tabAutocomplete: boolean;
          webSearch: boolean;
        };
      };
    }>("/integrations");
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
        stripeConfigured?: boolean;
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

  async listProjects(
    opts?: { workspaceId?: string; scope?: "personal" | "all"; fetchAll?: boolean }
  ) {
    const base = new URLSearchParams();
    if (opts?.workspaceId) base.set("workspaceId", opts.workspaceId);
    if (opts?.scope) base.set("scope", opts.scope);
    base.set("limit", "100");
    const prefix = base.toString();

    if (opts?.fetchAll) {
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
        return `/projects?${q}`;
      });
      return { data };
    }

    const res = await this.request<{
      data: Array<{
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
      }>;
      nextCursor?: string | null;
    }>(`/projects?${prefix}`);
    return { data: res.data };
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
      agentRules: string | null;
    }>(`/projects/${id}`);
  }

  updateProject(
    id: string,
    data: { name?: string; agentRules?: string | null }
  ) {
    return this.request<{ id: string; agentRules: string | null }>(
      `/projects/${id}`,
      { method: "PATCH", body: JSON.stringify(data) }
    );
  }

  deleteProject(id: string) {
    return this.request<void>(`/projects/${id}`, { method: "DELETE" });
  }

  async listMessages(projectId: string, opts?: { fetchAll?: boolean }) {
    const fetchPage = async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (cursor) params.set("cursor", cursor);
      return this.request<{
        data: Array<{
          id: string;
          role: string;
          content: string;
          createdAt: string;
        }>;
        nextCursor?: string | null;
      }>(`/projects/${projectId}/messages?${params}`);
    };

    if (!opts?.fetchAll) {
      const res = await fetchPage();
      return { data: res.data };
    }

    const data = await this.fetchAllCursorPages<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>((cursor) => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (cursor) params.set("cursor", cursor);
      return `/projects/${projectId}/messages?${params}`;
    });
    return { data };
  }

  sendMessage(
    projectId: string,
    content: string,
    opts?: {
      llmProvider?: "anthropic" | "deepseek" | "openai" | "gemini";
      attachedFiles?: string[];
      chatMode?: "ask" | "agent" | "composer";
      images?: Array<{ mediaType: string; data: string }>;
    }
  ) {
    return this.request<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>(`/projects/${projectId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        llmProvider: opts?.llmProvider,
        attachedFiles: opts?.attachedFiles,
        chatMode: opts?.chatMode,
        images: opts?.images,
      }),
    });
  }

  listProjectNotifications(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        read: boolean;
        metadata: Record<string, unknown>;
        createdAt: string;
      }>;
      unread: number;
    }>(`/projects/${projectId}/notifications`);
  }

  markProjectNotificationRead(projectId: string, notificationId: string) {
    return this.request<{ ok: boolean }>(
      `/projects/${projectId}/notifications/${notificationId}/read`,
      { method: "POST" }
    );
  }

  markAllProjectNotificationsRead(projectId: string) {
    return this.request<{ ok: boolean }>(
      `/projects/${projectId}/notifications/read-all`,
      { method: "POST" }
    );
  }

  listLlmProviders() {
    return this.request<{
      data: Array<{ id: "anthropic" | "deepseek"; label: string; default?: boolean }>;
      defaultProvider: string;
    }>("/llm/providers");
  }

  listDeployTargets() {
    return this.request<{
      data: Array<{
        id: "vercel" | "netlify" | "mock";
        label: string;
        configured: boolean;
        default?: boolean;
      }>;
      defaultTarget: string;
    }>("/platform/deploy-targets");
  }

  searchProjectFiles(projectId: string, q: string) {
    const params = new URLSearchParams({ q });
    return this.request<{
      data: Array<{
        path: string;
        snippet: string;
        kind?: "file" | "symbol";
        symbol?: string;
        line?: number;
      }>;
    }>(`/projects/${projectId}/files/search?${params}`);
  }

  listCodeSymbols(projectId: string, q?: string) {
    const params = q ? new URLSearchParams({ q }) : "";
    const suffix = params ? `?${params}` : "";
    return this.request<{
      data: Array<{
        path: string;
        kind: string;
        name: string;
        line: number;
        column: number;
      }>;
    }>(`/projects/${projectId}/symbols${suffix}`);
  }

  semanticCodebaseSearch(projectId: string, q: string, limit = 10) {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return this.request<{
      data: Array<{
        path: string;
        score: number;
        reason: string;
        snippet: string;
      }>;
    }>(`/projects/${projectId}/codebase/search?${params}`);
  }

  reindexCodebase(projectId: string) {
    return this.request<{ indexed: number }>(
      `/projects/${projectId}/codebase/reindex`,
      { method: "POST" }
    );
  }

  listProjectSnapshots(projectId: string) {
    return this.request<{
      branch: string;
      data: Array<{
        id: string;
        createdAt: string;
        source: string;
        fileCount: number;
        paths: string[];
      }>;
    }>(`/projects/${projectId}/history/snapshots`);
  }

  listProjectHistory(projectId: string) {
    return this.request<{
      data: Array<{
        path: string;
        version: number;
        source: string;
        createdAt: string;
      }>;
    }>(`/projects/${projectId}/history`);
  }

  restoreFileVersion(projectId: string, path: string, version: number) {
    return this.request<{ path: string; version: number }>(
      `/projects/${projectId}/files/restore-version`,
      {
        method: "POST",
        body: JSON.stringify({ path, version }),
      }
    );
  }

  getTerminalWsUrl(projectId: string) {
    const token = this.getToken() ?? "";
    const httpBase = API_URL.replace(/\/v1\/?$/, "");
    const wsBase = httpBase.replace(/^http/, "ws");
    const params = new URLSearchParams({ token });
    return `${wsBase}/v1/projects/${projectId}/preview/terminal?${params}`;
  }

  listAgentRuns(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        agentType: string;
        status: string;
        inputPrompt: string;
        outputSummary: string | null;
        errorMessage: string | null;
        errorCode: string | null;
        llmProvider: string | null;
        tokensInput: number;
        tokensOutput: number;
        toolCalls: number | null;
        filesGenerated: number | null;
        buildDurationMs: number | null;
        startedAt: string;
        completedAt: string | null;
        createdAt: string;
      }>;
      active: boolean;
    }>(`/projects/${projectId}/agent-runs`);
  }

  cancelAgentRun(projectId: string, runId: string) {
    return this.request<{
      data: {
        id: string;
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
      };
    }>(`/projects/${projectId}/agent-runs/${runId}/cancel`, {
      method: "POST",
    });
  }

  listAgentQueue(projectId: string) {
    return this.request<{
      data: Array<{
        id: string;
        kind: string;
        status: string;
        priority: number;
        waitForIdle: boolean;
        errorMessage: string | null;
        createdAt: string;
        startedAt: string | null;
        completedAt: string | null;
      }>;
      pending: number;
    }>(`/projects/${projectId}/agent-queue`);
  }

  getMcpConfig(projectId: string) {
    return this.request<{
      data: {
        allowWrites: boolean;
        servers: Array<{
          id: string;
          name: string;
          url?: string;
          enabled: boolean;
        }>;
        builtinTools: Array<{ name: string; description: string }>;
        externalTools?: Array<{ name: string; description: string }>;
      };
    }>(`/projects/${projectId}/mcp`);
  }

  updateMcpConfig(
    projectId: string,
    body: {
      servers: Array<{
        id: string;
        name: string;
        url?: string;
        enabled: boolean;
      }>;
      allowWrites?: boolean;
    }
  ) {
    return this.request<{ data: unknown }>(`/projects/${projectId}/mcp`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  invokeMcp(
    projectId: string,
    body: {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: Record<string, unknown>;
    }
  ) {
    return this.request<unknown>(`/projects/${projectId}/mcp`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  createStripeCheckout() {
    return this.request<{ data: { url: string; sessionId: string } }>(
      "/billing/checkout",
      { method: "POST" }
    );
  }

  createStripePortal() {
    return this.request<{ data: { url: string } }>("/billing/portal", {
      method: "POST",
    });
  }

  // Several workspace components list files on mount; share one in-flight
  // request per project instead of firing 3-4 identical paginated fetches.
  private listFilesInFlight = new Map<
    string,
    Promise<{ data: Array<{ path: string; version: number; createdAt: string }> }>
  >();

  listFiles(projectId: string) {
    const existing = this.listFilesInFlight.get(projectId);
    if (existing) return existing;

    const promise = this.fetchAllCursorPages<{
      path: string;
      version: number;
      createdAt: string;
    }>((cursor) => {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      return `/projects/${projectId}/files?${params}`;
    })
      .then((data) => ({ data }))
      .finally(() => {
        this.listFilesInFlight.delete(projectId);
      });
    this.listFilesInFlight.set(projectId, promise);
    return promise;
  }

  /** Bulk file read for LSP preloading — one request instead of N. */
  bulkReadFiles(projectId: string, paths: string[]) {
    return this.request<{
      data: Array<{ path: string; content: string; version: number }>;
    }>(`/projects/${projectId}/files/bulk-read`, {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
  }

  readFile(projectId: string, path: string, version?: number) {
    const params =
      version != null ? `?version=${encodeURIComponent(String(version))}` : "";
    return this.request<{
      path: string;
      content: string;
      version: number;
    }>(`/projects/${projectId}/files/${encodeFilePath(path)}${params}`);
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
      `/projects/${projectId}/files/${encodeFilePath(path)}`,
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

  createGithubPullRequest(
    projectId: string,
    body?: { title?: string; body?: string }
  ) {
    return this.request<{
      data: {
        pullRequestUrl: string;
        pullRequestNumber: number;
        branch: string;
      };
    }>(`/projects/${projectId}/github/pull-request`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
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

  proposeAiEdit(
    projectId: string,
    path: string,
    instruction: string,
    opts?: { selectedText?: string }
  ) {
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
      body: JSON.stringify({
        path,
        instruction,
        selectedText: opts?.selectedText,
      }),
    });
  }

  getChangeset(projectId: string) {
    return this.request<{
      pending: boolean;
      fileCount: number;
      files: Array<{
        path: string;
        previousContent: string;
        newContent: string;
      }>;
    }>(`/projects/${projectId}/changeset`);
  }

  applyChangeset(projectId: string, paths?: string[]) {
    return this.request<{ applied: number; paths: string[] }>(
      `/projects/${projectId}/changeset/apply`,
      {
        method: "POST",
        body: JSON.stringify(paths && paths.length > 0 ? { paths } : {}),
      }
    );
  }

  discardChangeset(projectId: string, paths?: string[]) {
    return this.request<{ discarded: number }>(
      `/projects/${projectId}/changeset/discard`,
      {
        method: "POST",
        body: JSON.stringify(paths && paths.length > 0 ? { paths } : {}),
      }
    );
  }

  updateChangesetEntry(projectId: string, path: string, content: string) {
    return this.request<{ path: string }>(
      `/projects/${projectId}/changeset/update`,
      {
        method: "POST",
        body: JSON.stringify({ path, content }),
      }
    );
  }

  tabCompletion(
    projectId: string,
    input: {
      path: string;
      prefix: string;
      suffix: string;
      language?: string;
      recentEdits?: string;
    }
  ) {
    return this.request<{ data: { completion: string } }>(
      `/projects/${projectId}/files/tab-completion`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  stageChangesetEntry(projectId: string, path: string, content: string) {
    return this.request<{ written: string[] }>(
      `/projects/${projectId}/changeset/stage`,
      { method: "POST", body: JSON.stringify({ path, content }) }
    );
  }

  aiTerminalCommand(projectId: string, instruction: string) {
    return this.request<{ data: { command: string } }>(
      `/projects/${projectId}/ai/terminal-command`,
      { method: "POST", body: JSON.stringify({ instruction }) }
    );
  }

  aiQuickFix(
    projectId: string,
    input: {
      path: string;
      content: string;
      errors: Array<{ line: number; message: string }>;
    }
  ) {
    return this.request<{ data: { content: string } }>(
      `/projects/${projectId}/ai/quick-fix`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  restoreCheckpoint(projectId: string, at: string) {
    return this.request<{
      restored: number;
      deleted: number;
      paths: string[];
    }>(`/projects/${projectId}/restore`, {
      method: "POST",
      body: JSON.stringify({ at }),
    });
  }

  getUserRules() {
    return this.request<{ agentRules: string | null }>("/users/me/rules");
  }

  updateUserRules(agentRules: string | null) {
    return this.request<{ agentRules: string | null }>("/users/me/rules", {
      method: "PATCH",
      body: JSON.stringify({ agentRules }),
    });
  }

  applyAiEdit(projectId: string, path: string, content: string) {
    return this.request<{
      path: string;
      version: number | null;
      pendingReview?: boolean;
    }>(
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
