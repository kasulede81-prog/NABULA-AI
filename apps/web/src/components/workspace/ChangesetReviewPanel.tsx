"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { languageForPath } from "@/lib/monaco-language";
import { computeHunks, applyHunkSelection, type DiffHunk } from "@/lib/line-diff";
import { cn } from "@/lib/utils";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

export interface ProposedChange {
  path: string;
  previousContent: string;
  newContent: string;
}

interface ChangesetReviewPanelProps {
  projectId: string;
  files: ProposedChange[];
  onClose: () => void;
  onApplied: () => void;
}

type ViewMode = "hunks" | "diff";

export function ChangesetReviewPanel({
  projectId,
  files: initialFiles,
  onClose,
  onApplied,
}: ChangesetReviewPanelProps) {
  const [files, setFiles] = useState(initialFiles);
  const [activePath, setActivePath] = useState(initialFiles[0]?.path ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("hunks");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // path -> set of rejected hunk ids (default: everything accepted)
  const [rejected, setRejected] = useState<Map<string, Set<number>>>(
    new Map()
  );

  const active = files.find((f) => f.path === activePath) ?? files[0] ?? null;

  const hunks = useMemo<DiffHunk[]>(
    () =>
      active
        ? computeHunks(active.previousContent, active.newContent)
        : [],
    [active]
  );

  const rejectedForActive = rejected.get(active?.path ?? "") ?? new Set();

  const toggleHunk = (hunkId: number) => {
    if (!active) return;
    setRejected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(active.path) ?? []);
      if (set.has(hunkId)) set.delete(hunkId);
      else set.add(hunkId);
      next.set(active.path, set);
      return next;
    });
  };

  const removeFileLocally = (path: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (next.length === 0) {
        onApplied();
        onClose();
      } else if (path === activePath) {
        setActivePath(next[0].path);
      }
      return next;
    });
  };

  const handleApplyFile = async (file: ProposedChange) => {
    setBusy(file.path);
    setError(null);
    try {
      const fileHunks = computeHunks(file.previousContent, file.newContent);
      const rejectedIds = rejected.get(file.path) ?? new Set<number>();
      if (rejectedIds.size > 0) {
        const acceptedIds = new Set(
          fileHunks.filter((h) => !rejectedIds.has(h.id)).map((h) => h.id)
        );
        if (acceptedIds.size === 0) {
          await api.discardChangeset(projectId, [file.path]);
          removeFileLocally(file.path);
          return;
        }
        const merged = applyHunkSelection(
          file.previousContent,
          file.newContent,
          fileHunks,
          acceptedIds
        );
        await api.updateChangesetEntry(projectId, file.path, merged);
      }
      await api.applyChangeset(projectId, [file.path]);
      removeFileLocally(file.path);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Apply failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDiscardFile = async (file: ProposedChange) => {
    setBusy(file.path);
    setError(null);
    try {
      await api.discardChangeset(projectId, [file.path]);
      removeFileLocally(file.path);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Discard failed");
    } finally {
      setBusy(null);
    }
  };

  const handleApplyAll = async () => {
    setBusy("__all__");
    setError(null);
    try {
      // Honor per-hunk rejections on every file before bulk apply.
      for (const file of files) {
        const rejectedIds = rejected.get(file.path);
        if (!rejectedIds || rejectedIds.size === 0) continue;
        const fileHunks = computeHunks(file.previousContent, file.newContent);
        const acceptedIds = new Set(
          fileHunks.filter((h) => !rejectedIds.has(h.id)).map((h) => h.id)
        );
        if (acceptedIds.size === 0) {
          await api.discardChangeset(projectId, [file.path]);
          continue;
        }
        const merged = applyHunkSelection(
          file.previousContent,
          file.newContent,
          fileHunks,
          acceptedIds
        );
        await api.updateChangesetEntry(projectId, file.path, merged);
      }
      await api.applyChangeset(projectId);
      onApplied();
      onClose();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Apply failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDiscardAll = async () => {
    setBusy("__all__");
    setError(null);
    try {
      await api.discardChangeset(projectId);
      onClose();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Discard failed");
    } finally {
      setBusy(null);
    }
  };

  if (files.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Review agent changes
            </h3>
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"} proposed —
              accept or reject individual changes before applying.
            </p>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("hunks")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px]",
                viewMode === "hunks"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Changes
            </button>
            <button
              type="button"
              onClick={() => setViewMode("diff")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px]",
                viewMode === "diff"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Side by side
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-border p-2">
            {files.map((file) => {
              const fileRejected = rejected.get(file.path);
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActivePath(file.path)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs",
                    file.path === activePath
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60"
                  )}
                >
                  {file.path}
                  {fileRejected && fileRejected.size > 0 && (
                    <span className="ml-1 text-[10px] text-warning">
                      ({fileRejected.size} rejected)
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          {active && viewMode === "diff" && (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="grid grid-cols-2 border-b border-border text-center text-xs text-muted-foreground">
                <span className="py-1">Before</span>
                <span className="py-1">After</span>
              </div>
              <div className="min-h-[360px] flex-1">
                <DiffEditor
                  original={active.previousContent}
                  modified={active.newContent}
                  language={languageForPath(active.path)}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                  }}
                />
              </div>
            </div>
          )}

          {active && viewMode === "hunks" && (
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
              {hunks.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No line changes detected (file may be identical or new).
                </p>
              ) : (
                <div className="space-y-3">
                  {hunks.map((hunk) => {
                    const isRejected = rejectedForActive.has(hunk.id);
                    return (
                      <div
                        key={hunk.id}
                        className={cn(
                          "overflow-hidden rounded-md border",
                          isRejected
                            ? "border-border opacity-60"
                            : "border-primary/40"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-2 py-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            @@ line {hunk.oldStart} — −{hunk.oldLines.length} +
                            {hunk.newLines.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleHunk(hunk.id)}
                            className={cn(
                              "rounded px-2 py-0.5 text-[10px] font-medium",
                              isRejected
                                ? "bg-secondary text-muted-foreground hover:text-foreground"
                                : "bg-primary/20 text-foreground"
                            )}
                          >
                            {isRejected ? "Rejected — click to accept" : "Accepted — click to reject"}
                          </button>
                        </div>
                        <pre className="max-h-64 overflow-auto p-2 font-mono text-[11px] leading-4">
                          {hunk.contextBefore.map((l, i) => (
                            <div key={`b${i}`} className="text-muted-foreground">
                              {"  "}
                              {l}
                            </div>
                          ))}
                          {hunk.oldLines.map((l, i) => (
                            <div
                              key={`o${i}`}
                              className="bg-red-950/40 text-red-300"
                            >
                              {"- "}
                              {l}
                            </div>
                          ))}
                          {hunk.newLines.map((l, i) => (
                            <div
                              key={`n${i}`}
                              className="bg-emerald-950/40 text-emerald-300"
                            >
                              {"+ "}
                              {l}
                            </div>
                          ))}
                          {hunk.contextAfter.map((l, i) => (
                            <div key={`a${i}`} className="text-muted-foreground">
                              {"  "}
                              {l}
                            </div>
                          ))}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="flex gap-2">
            {active && (
              <>
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => handleDiscardFile(active)}
                  loading={busy === active.path}
                  disabled={busy !== null}
                >
                  Discard file
                </Button>
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={() => handleApplyFile(active)}
                  loading={busy === active.path}
                  disabled={busy !== null}
                >
                  Apply file
                  {rejectedForActive.size > 0
                    ? ` (${hunks.length - rejectedForActive.size}/${hunks.length} hunks)`
                    : ""}
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={handleDiscardAll}
              loading={busy === "__all__"}
              disabled={busy !== null}
            >
              Discard all
            </Button>
            <Button
              className="text-xs"
              onClick={handleApplyAll}
              loading={busy === "__all__"}
              disabled={busy !== null}
            >
              Apply all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
