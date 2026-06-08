"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  SseEvents,
  PreviewPhaseLabels,
  type PreviewPhase,
  type PreviewLogEntry,
} from "@nebula/shared";
import type { SseMessage } from "@/hooks/useSSE";

type PanelTab = "preview" | "logs";

interface PreviewData {
  id: string;
  status: string;
  phase: PreviewPhase;
  previewUrl: string | null;
  detectedPort: number | null;
  framework: string | null;
  packageManager: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sandboxId: string | null;
}

interface PreviewPanelProps {
  projectId: string;
  projectStatus: string;
  sseEvents: SseMessage[];
  sseConnected?: boolean;
}

const ACTIVE_PHASES: PreviewPhase[] = [
  "preparing_sandbox",
  "installing_dependencies",
  "building_project",
  "starting_server",
  "waiting_for_health_check",
];

function isActivePhase(phase: PreviewPhase | undefined): boolean {
  return !!phase && ACTIVE_PHASES.includes(phase);
}

function levelColor(level: string): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "stderr":
      return "text-orange-300";
    case "stdout":
      return "text-gray-300";
    default:
      return "text-gray-400";
  }
}

export function PreviewPanel({
  projectId,
  projectStatus,
  sseEvents,
  sseConnected = false,
}: PreviewPanelProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("preview");
  const [logs, setLogs] = useState<PreviewLogEntry[]>([]);
  const [iframeKey, setIframeKey] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastLogAtRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getPreview(projectId);
      if (res.data) {
        setPreview({
          id: res.data.id,
          status: res.data.status,
          phase: (res.data.phase as PreviewPhase) ?? "preparing_sandbox",
          previewUrl: res.data.previewUrl,
          detectedPort: res.data.detectedPort ?? null,
          framework: res.data.framework ?? null,
          packageManager: res.data.packageManager ?? null,
          errorCode: res.data.errorCode ?? null,
          errorMessage: res.data.errorMessage ?? null,
          sandboxId: res.data.sandboxId,
        });
        if (res.data.status === "starting") {
          setCreating(true);
        }
        if (res.data.status === "error") {
          setActionError(res.data.errorMessage ?? "Preview failed");
        }
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchLogs = useCallback(
    async (previewId: string, incremental = false) => {
      try {
        const since = incremental ? lastLogAtRef.current ?? undefined : undefined;
        const res = await api.getPreviewLogs(previewId, since);
        if (res.data.length === 0) return;

        const entries = res.data as PreviewLogEntry[];
        setLogs((prev) => {
          const merged = incremental ? [...prev, ...entries] : entries;
          const seen = new Set<string>();
          return merged.filter((entry) => {
            if (seen.has(entry.id)) return false;
            seen.add(entry.id);
            return true;
          });
        });

        const last = res.data[res.data.length - 1];
        if (last) lastLogAtRef.current = last.createdAt;
      } catch {
        // logs are best-effort
      }
    },
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!preview?.id) return;
    void fetchLogs(preview.id, false);
  }, [preview?.id, fetchLogs]);

  useEffect(() => {
    if (!preview?.id || preview.status !== "starting") return;
    if (sseConnected) return;

    const interval = setInterval(() => {
      void fetchLogs(preview.id, true);
      void api.getPreviewStatus(preview.id).then((res) => {
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                status: res.data.status,
                phase: res.data.phase as PreviewPhase,
                previewUrl: res.data.previewUrl,
                detectedPort: res.data.detectedPort,
                framework: res.data.framework,
                packageManager: res.data.packageManager,
                errorCode: res.data.errorCode,
                errorMessage: res.data.errorMessage,
              }
            : prev
        );
        if (res.data.status === "ready") setCreating(false);
        if (res.data.status === "error") {
          setCreating(false);
          setActionError(res.data.errorMessage ?? "Preview failed");
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [preview?.id, preview?.status, fetchLogs, sseConnected]);

  useEffect(() => {
    const recent = sseEvents.slice(-20);
    for (const event of recent) {
      if (!preview?.id) continue;

      if (event.type === SseEvents.PREVIEW_STARTED) {
        setCreating(true);
        setActionError(null);
        setLogs([]);
        lastLogAtRef.current = null;
        const previewId = (event.data as { previewId?: string }).previewId;
        setPreview((prev) => ({
          id: previewId ?? prev?.id ?? "",
          status: "starting",
          phase: "preparing_sandbox",
          previewUrl: null,
          detectedPort: null,
          framework: null,
          packageManager: null,
          errorCode: null,
          errorMessage: null,
          sandboxId: null,
        }));
      }

      if (event.type === SseEvents.PREVIEW_PHASE) {
        const data = event.data as {
          previewId?: string;
          phase?: PreviewPhase;
          previewUrl?: string;
          detectedPort?: number;
        };
        if (!data.previewId || data.previewId !== preview.id) continue;
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                phase: data.phase ?? prev.phase,
                previewUrl: data.previewUrl ?? prev.previewUrl,
                detectedPort: data.detectedPort ?? prev.detectedPort,
              }
            : prev
        );
      }

      if (event.type === SseEvents.PREVIEW_LOG) {
        const entry = event.data as unknown as PreviewLogEntry;
        if (entry.previewId !== preview.id) continue;
        setLogs((prev) => {
          if (prev.some((l) => l.id === entry.id)) return prev;
          return [...prev, entry];
        });
        lastLogAtRef.current = entry.createdAt;
      }

      if (event.type === SseEvents.PREVIEW_READY) {
        setCreating(false);
        const data = event.data as {
          previewUrl?: string;
          sandboxId?: string;
          detectedPort?: number;
          phase?: PreviewPhase;
        };
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                status: "ready",
                phase: data.phase ?? "preview_ready",
                previewUrl: data.previewUrl ?? null,
                sandboxId: data.sandboxId ?? null,
                detectedPort: data.detectedPort ?? prev.detectedPort,
              }
            : prev
        );
      }

      if (event.type === SseEvents.PREVIEW_FAILED) {
        setCreating(false);
        const data = event.data as {
          message?: string;
          code?: string;
          phase?: PreviewPhase;
        };
        setActionError(data.message ?? "Preview failed");
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                phase: data.phase ?? "failed",
                previewUrl: null,
                errorCode: data.code ?? null,
                errorMessage: data.message ?? null,
              }
            : prev
        );
      }

      if (
        event.type === SseEvents.PREVIEW_DELETED ||
        event.type === SseEvents.PREVIEW_EXPIRED
      ) {
        setCreating(false);
        setPreview(null);
        setLogs([]);
      }
    }
  }, [sseEvents, preview?.id]);

  useEffect(() => {
    if (activeTab === "logs") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  const handleCreate = async () => {
    setActionError(null);
    setCreating(true);
    setLogs([]);
    lastLogAtRef.current = null;
    try {
      const res = await api.createPreview(projectId);
      setPreview({
        id: res.previewId,
        status: "starting",
        phase: "preparing_sandbox",
        previewUrl: null,
        detectedPort: null,
        framework: null,
        packageManager: null,
        errorCode: null,
        errorMessage: null,
        sandboxId: null,
      });
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setActionError(apiErr.error?.message ?? "Failed to start preview");
      setCreating(false);
    }
  };

  const handleStop = async () => {
    setActionError(null);
    try {
      if (preview?.id) {
        await api.deletePreviewById(preview.id);
      } else {
        await api.deletePreview(projectId);
      }
      setPreview(null);
      setLogs([]);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setActionError(apiErr.error?.message ?? "Failed to stop preview");
    }
  };

  const handleRefreshIframe = () => {
    setIframeKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading preview...
      </div>
    );
  }

  const isProvisioning =
    creating || preview?.status === "starting" || isActivePhase(preview?.phase);
  const isReady = preview?.status === "ready" && !!preview.previewUrl;
  const isFailed = preview?.status === "error" || preview?.phase === "failed";
  const canCreate =
    projectStatus === "ready" && !isProvisioning && !isReady;

  const phaseLabel = preview?.phase
    ? PreviewPhaseLabels[preview.phase]
    : "No preview";

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-medium text-white">Live Preview</h2>
          <div className="flex gap-1 rounded-md bg-surface-border/40 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`rounded px-2 py-0.5 text-xs ${
                activeTab === "preview"
                  ? "bg-nebula-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("logs")}
              className={`rounded px-2 py-0.5 text-xs ${
                activeTab === "logs"
                  ? "bg-nebula-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Logs
              {logs.length > 0 && (
                <span className="ml-1 text-gray-500">({logs.length})</span>
              )}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {isReady && preview?.previewUrl && (
            <a
              href={preview.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-nebula-400 hover:underline"
            >
              Open tab
            </a>
          )}
          {isReady && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={handleRefreshIframe}
            >
              Refresh
            </Button>
          )}
          {(isReady || isProvisioning) && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={handleStop}>
              Stop
            </Button>
          )}
          {(canCreate || isFailed) && (
            <Button
              className="px-2 py-1 text-xs"
              onClick={handleCreate}
              disabled={isProvisioning}
            >
              {isFailed ? "Restart" : isProvisioning ? "Creating..." : "Create Preview"}
            </Button>
          )}
        </div>
      </div>

      {(isProvisioning || preview) && (
        <div className="border-b border-surface-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 ${
                isReady
                  ? "text-green-400"
                  : isFailed
                    ? "text-red-400"
                    : "text-nebula-400"
              }`}
            >
              {isProvisioning && !isFailed && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-nebula-500" />
              )}
              {phaseLabel}
            </span>
            {preview?.framework && (
              <span className="text-gray-500">Framework: {preview.framework}</span>
            )}
            {preview?.packageManager && (
              <span className="text-gray-500">PM: {preview.packageManager}</span>
            )}
            {preview?.detectedPort && (
              <span className="text-gray-500">Port: {preview.detectedPort}</span>
            )}
          </div>
        </div>
      )}

      {actionError && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-300 whitespace-pre-wrap">
          {preview?.errorCode && (
            <span className="mr-2 font-mono text-red-400">[{preview.errorCode}]</span>
          )}
          {actionError}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {activeTab === "logs" ? (
          <div className="h-full overflow-y-auto bg-[#0d1117] p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-600">No logs yet. Start a preview to stream output.</p>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
                  <span className="shrink-0 text-gray-600">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="shrink-0 w-14 text-gray-500">[{entry.source}]</span>
                  <span className={`${levelColor(entry.level)} break-all`}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        ) : (
          <>
            {!preview && !isProvisioning && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-gray-400">No preview yet</p>
                {projectStatus === "ready" ? (
                  <p className="text-xs text-gray-500">
                    Create an isolated sandbox preview with automatic install, build, and
                    health checks.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Build must reach <span className="text-green-400">ready</span> before
                    preview.
                  </p>
                )}
              </div>
            )}

            {isProvisioning && !isReady && !isFailed && (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-nebula-500 border-t-transparent" />
                <p className="text-sm text-gray-400">{phaseLabel}</p>
                <p className="text-xs text-gray-500">
                  Installing dependencies, building, and waiting for health check
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("logs")}
                  className="text-xs text-nebula-400 hover:underline"
                >
                  View live logs
                </button>
              </div>
            )}

            {isFailed && !isReady && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-red-400">Preview failed</p>
                <p className="text-xs text-gray-500 whitespace-pre-wrap">
                  {actionError ?? "Check logs and E2B configuration."}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("logs")}
                  className="text-xs text-nebula-400 hover:underline"
                >
                  View error logs
                </button>
              </div>
            )}

            {isReady && preview?.previewUrl && (
              <iframe
                key={iframeKey}
                src={preview.previewUrl}
                title="App preview"
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
