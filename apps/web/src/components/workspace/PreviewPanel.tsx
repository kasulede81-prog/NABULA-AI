"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SseEvents } from "@nebula/shared";
import type { SseMessage } from "@/hooks/useSSE";

type PreviewState = "none" | "creating" | "ready" | "failed";

interface PreviewData {
  id: string;
  status: string;
  previewUrl: string | null;
  sandboxId: string | null;
}

interface PreviewPanelProps {
  projectId: string;
  projectStatus: string;
  sseEvents: SseMessage[];
}

function mapStatus(status: string | undefined): PreviewState {
  switch (status) {
    case "starting":
      return "creating";
    case "ready":
      return "ready";
    case "error":
      return "failed";
    default:
      return "none";
  }
}

export function PreviewPanel({
  projectId,
  projectStatus,
  sseEvents,
}: PreviewPanelProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getPreview(projectId);
      setPreview(res.data);
    } catch {
      setPreview(null);
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

    if (last.type === SseEvents.PREVIEW_STARTED) {
      setCreating(true);
      setActionError(null);
      setPreview((prev) =>
        prev
          ? { ...prev, status: "starting", previewUrl: null }
          : { id: "", status: "starting", previewUrl: null, sandboxId: null }
      );
    }

    if (last.type === SseEvents.PREVIEW_READY) {
      setCreating(false);
      const url = (last.data as { previewUrl?: string }).previewUrl ?? null;
      setPreview((prev) => ({
        id: prev?.id ?? "",
        status: "ready",
        previewUrl: url,
        sandboxId: (last.data as { sandboxId?: string }).sandboxId ?? null,
      }));
    }

    if (last.type === SseEvents.PREVIEW_FAILED) {
      setCreating(false);
      setActionError((last.data as { message?: string }).message ?? "Preview failed");
      setPreview((prev) =>
        prev ? { ...prev, status: "error", previewUrl: null } : null
      );
    }

    if (last.type === SseEvents.PREVIEW_DELETED) {
      setCreating(false);
      setPreview(null);
    }
  }, [sseEvents]);

  const handleCreate = async () => {
    setActionError(null);
    setCreating(true);
    try {
      await api.startPreview(projectId);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setActionError(apiErr.error?.message ?? "Failed to start preview");
      setCreating(false);
    }
  };

  const handleStop = async () => {
    setActionError(null);
    try {
      await api.deletePreview(projectId);
      setPreview(null);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setActionError(apiErr.error?.message ?? "Failed to stop preview");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading preview...
      </div>
    );
  }

  const state = creating ? "creating" : mapStatus(preview?.status);
  const canCreate = projectStatus === "ready" && state !== "creating";

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
        <h2 className="text-sm font-medium text-white">Live Preview</h2>
        <div className="flex gap-2">
          {state === "ready" && preview?.previewUrl && (
            <a
              href={preview.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-nebula-400 hover:underline"
            >
              Open tab
            </a>
          )}
          {state === "ready" && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={handleStop}>
              Stop
            </Button>
          )}
          {canCreate && state !== "ready" && (
            <Button className="px-2 py-1 text-xs" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Preview"}
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {state === "none" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-gray-400">No preview yet</p>
            {projectStatus === "ready" ? (
              <p className="text-xs text-gray-500">
                Create an E2B sandbox preview of your built app.
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Build must reach <span className="text-green-400">ready</span> before
                preview.
              </p>
            )}
          </div>
        )}

        {state === "creating" && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-nebula-500 border-t-transparent" />
            <p className="text-sm text-gray-400">Creating preview...</p>
            <p className="text-xs text-gray-500">
              Installing dependencies and starting Next.js in E2B
            </p>
          </div>
        )}

        {state === "failed" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-red-400">Preview failed</p>
            <p className="text-xs text-gray-500">
              {actionError ?? "Check API logs and E2B configuration."}
            </p>
            {canCreate && (
              <Button className="px-2 py-1 text-xs" onClick={handleCreate}>
                Retry Preview
              </Button>
            )}
          </div>
        )}

        {state === "ready" && preview?.previewUrl && (
          <iframe
            src={preview.previewUrl}
            title="App preview"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
