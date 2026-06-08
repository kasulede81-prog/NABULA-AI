"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SseEvents } from "@nebula/shared";
import type { SseMessage } from "@/hooks/useSSE";

interface GitHubExportPanelProps {
  projectId: string;
  projectStatus: string;
  sseEvents: SseMessage[];
}

interface ProjectGithubStatus {
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
}

type PanelState = "disconnected" | "connected" | "repository" | "sync";

function deriveState(status: ProjectGithubStatus): PanelState {
  if (!status.connected) return "disconnected";
  if (!status.repository) return "connected";
  if (status.syncAvailable) return "sync";
  return "repository";
}

export function GitHubExportPanel({
  projectId,
  projectStatus,
  sseEvents,
}: GitHubExportPanelProps) {
  const [status, setStatus] = useState<ProjectGithubStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showPat, setShowPat] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getGithubProjectStatus(projectId);
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const last = sseEvents[sseEvents.length - 1];
    if (!last) return;

    if (
      last.type === SseEvents.GITHUB_EXPORT_STARTED ||
      last.type === SseEvents.GITHUB_SYNC_STARTED
    ) {
      setBusy(true);
      setError(null);
    }
    if (
      last.type === SseEvents.GITHUB_EXPORT_COMPLETED ||
      last.type === SseEvents.GITHUB_SYNC_COMPLETED
    ) {
      setBusy(false);
      void refresh();
    }
    if (
      last.type === SseEvents.GITHUB_EXPORT_FAILED ||
      last.type === SseEvents.GITHUB_SYNC_FAILED
    ) {
      setBusy(false);
      setError((last.data as { message?: string }).message ?? "GitHub operation failed");
    }
  }, [sseEvents, refresh]);

  const handleOAuthConnect = () => {
    const url = api.getGithubConnectUrl();
    if (!url) {
      setError("Sign in required to connect GitHub");
      return;
    }
    window.location.href = url;
  };

  const handlePatConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.connectGithub(tokenInput);
      setShowPat(false);
      setTokenInput("");
      await refresh();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Failed to connect GitHub");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectGithub();
      await refresh();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createGithubRepository(projectId);
      await refresh();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Failed to create repository");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.syncGithubRepository(projectId);
      await refresh();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Failed to sync changes");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <span className="text-xs text-gray-500">GitHub...</span>;
  }

  if (!status) {
    return <span className="text-xs text-gray-500">GitHub unavailable</span>;
  }

  const panelState = deriveState(status);
  const canCreate = projectStatus === "ready" && panelState === "connected";

  const stateLabel: Record<PanelState, string> = {
    disconnected: "Disconnected",
    connected: "Connected",
    repository: "Repository Created",
    sync: "Sync Available",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 rounded border border-surface-border px-2 py-1 text-xs text-gray-300 hover:bg-surface-card"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            panelState === "disconnected"
              ? "bg-gray-500"
              : panelState === "sync"
                ? "bg-amber-400"
                : "bg-green-400"
          }`}
        />
        GitHub · {stateLabel[panelState]}
        {status.repository && (
          <span className="text-gray-500">({status.repository.repositoryName})</span>
        )}
      </button>

      {expanded && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border border-surface-border bg-surface-card p-3 shadow-lg">
          <div className="space-y-3 text-xs">
            {status.connected && status.username && (
              <p className="text-gray-400">
                Connected as <span className="text-white">@{status.username}</span>
                {status.oauthConfigured ? " (OAuth)" : ""}
              </p>
            )}

            {status.repository && (
              <dl className="space-y-1 text-gray-400">
                <div className="flex justify-between gap-2">
                  <dt>Repository</dt>
                  <dd className="truncate text-white">{status.repository.repositoryName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Branch</dt>
                  <dd className="text-white">{status.repository.defaultBranch}</dd>
                </div>
                {status.repository.lastCommitSha && (
                  <div className="flex justify-between gap-2">
                    <dt>Last commit</dt>
                    <dd className="font-mono text-white">
                      {status.repository.lastCommitSha.slice(0, 7)}
                    </dd>
                  </div>
                )}
                {status.repository.lastSyncedAt && (
                  <div className="flex justify-between gap-2">
                    <dt>Last sync</dt>
                    <dd className="text-white">
                      {new Date(status.repository.lastSyncedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {panelState === "sync" && (
              <p className="text-amber-400">
                {status.changedFileCount} file
                {status.changedFileCount === 1 ? "" : "s"} changed since last sync
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {panelState === "disconnected" && (
                <>
                  {status.oauthConfigured && (
                    <Button className="px-2 py-1 text-xs" onClick={handleOAuthConnect}>
                      Connect GitHub
                    </Button>
                  )}
                  {!showPat ? (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => setShowPat(true)}
                    >
                      Use PAT
                    </Button>
                  ) : (
                    <div className="flex w-full flex-col gap-2">
                      <input
                        type="password"
                        placeholder="GitHub PAT (repo scope)"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs text-white"
                      />
                      <div className="flex gap-2">
                        <Button
                          className="px-2 py-1 text-xs"
                          onClick={handlePatConnect}
                          loading={busy}
                          disabled={!tokenInput.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            setShowPat(false);
                            setTokenInput("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {panelState === "connected" && (
                <>
                  <Button
                    className="px-2 py-1 text-xs"
                    onClick={handleCreate}
                    loading={busy}
                    disabled={!canCreate || busy}
                    title={
                      projectStatus !== "ready"
                        ? "Build must be ready before creating a repository"
                        : undefined
                    }
                  >
                    Create Repository
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={handleDisconnect}
                    loading={busy}
                  >
                    Disconnect
                  </Button>
                </>
              )}

              {(panelState === "repository" || panelState === "sync") && (
                <>
                  {panelState === "sync" && (
                    <Button
                      className="px-2 py-1 text-xs"
                      onClick={handleSync}
                      loading={busy}
                      disabled={busy}
                    >
                      Sync Changes
                    </Button>
                  )}
                  {status.repository && (
                    <a
                      href={status.repository.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" className="px-2 py-1 text-xs">
                        Open Repository
                      </Button>
                    </a>
                  )}
                </>
              )}
            </div>

            {error && (
              <p className="text-red-400" title={error}>
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
