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

interface ExportInfo {
  repoUrl: string;
  repoFullName: string | null;
  exportedAt: string | null;
}

export function GitHubExportPanel({
  projectId,
  projectStatus,
  sseEvents,
}: GitHubExportPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [conn, exp] = await Promise.all([
        api.getGithubConnection(),
        api.getGithubExport(projectId),
      ]);
      setConnected(conn.data.connected);
      setUsername(conn.data.username ?? null);
      setExportInfo(exp.data);
    } catch {
      setConnected(false);
      setExportInfo(null);
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

    if (last.type === SseEvents.GITHUB_EXPORT_STARTED) {
      setExporting(true);
      setError(null);
    }
    if (last.type === SseEvents.GITHUB_EXPORT_COMPLETED) {
      setExporting(false);
      const repoUrl = (last.data as { repoUrl?: string }).repoUrl;
      const repoFullName = (last.data as { repoFullName?: string }).repoFullName;
      if (repoUrl) {
        setExportInfo({
          repoUrl,
          repoFullName: repoFullName ?? null,
          exportedAt: new Date().toISOString(),
        });
      }
    }
    if (last.type === SseEvents.GITHUB_EXPORT_FAILED) {
      setExporting(false);
      setError((last.data as { message?: string }).message ?? "Export failed");
    }
  }, [sseEvents]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await api.connectGithub(tokenInput);
      setConnected(true);
      setUsername(res.data.username);
      setShowConnect(false);
      setTokenInput("");
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Failed to connect GitHub");
    } finally {
      setConnecting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await api.exportToGithub(projectId);
      setExportInfo({
        repoUrl: res.data.repoUrl,
        repoFullName: res.data.repoFullName,
        exportedAt: res.data.exportedAt,
      });
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const canExport = projectStatus === "ready" && connected && !exportInfo;

  if (loading) {
    return (
      <span className="text-xs text-gray-500">GitHub...</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {exportInfo ? (
        <a
          href={exportInfo.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-nebula-400 hover:underline"
        >
          {exportInfo.repoFullName ?? "View on GitHub"}
        </a>
      ) : (
        <>
          {!connected && !showConnect && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => setShowConnect(true)}
            >
              Connect GitHub
            </Button>
          )}
          {showConnect && (
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="GitHub PAT (repo scope)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-44 rounded border border-surface-border bg-surface px-2 py-1 text-xs text-white"
              />
              <Button
                className="px-2 py-1 text-xs"
                onClick={handleConnect}
                loading={connecting}
                disabled={!tokenInput.trim()}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  setShowConnect(false);
                  setTokenInput("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {connected && !showConnect && (
            <Button
              className="px-2 py-1 text-xs"
              onClick={handleExport}
              loading={exporting}
              disabled={!canExport || exporting}
              title={
                projectStatus !== "ready"
                  ? "Build must be ready before export"
                  : `Export as @${username}`
              }
            >
              {exporting ? "Exporting..." : "Export to GitHub"}
            </Button>
          )}
        </>
      )}
      {error && (
        <span className="max-w-[200px] truncate text-xs text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
