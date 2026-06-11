"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { languageForPath } from "@/lib/monaco-language";
import { cn } from "@/lib/utils";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

interface TimelineEntry {
  path: string;
  version: number;
  source: string;
  createdAt: string;
}

interface SnapshotEntry {
  id: string;
  createdAt: string;
  source: string;
  fileCount: number;
  paths: string[];
}

interface HistoryTabProps {
  projectId: string;
  onOpenFile?: (path: string) => void;
}

export function HistoryTab({ projectId, onOpenFile }: HistoryTabProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TimelineEntry | null>(null);
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await api.reindexCodebase(projectId).catch(() => undefined);
      const [res, snaps] = await Promise.all([
        api.listProjectHistory(projectId),
        api.listProjectSnapshots(projectId).catch(() => ({
          branch: "main",
          data: [],
        })),
      ]);
      setTimeline(res.data);
      setSnapshots(snaps.data);
      setBranch(snaps.branch);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showDiff = async (entry: TimelineEntry) => {
    setSelected(entry);
    setDiffLoading(true);
    try {
      const current = await api.readFile(projectId, entry.path);
      const archived = await api.readFile(projectId, entry.path, entry.version);
      setBefore(archived.content);
      setAfter(current.content);
    } catch {
      setBefore("");
      setAfter("");
    } finally {
      setDiffLoading(false);
    }
  };

  const restore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await api.restoreFileVersion(projectId, selected.path, selected.version);
      await load();
      onOpenFile?.(selected.path);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Git history</h2>
        <p className="text-xs text-muted-foreground">
          Branch <span className="font-mono text-foreground">{branch}</span> —
          snapshots and per-file versions
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-border p-2">
          {loading && (
            <p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
          )}
          {!loading && snapshots.length > 0 && (
            <div className="mb-3 border-b border-border pb-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Snapshots
              </p>
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="mb-1 rounded px-2 py-2 text-left text-xs hover:bg-secondary/60"
                >
                  <div className="font-medium">
                    {new Date(snap.createdAt).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {snap.fileCount} file{snap.fileCount === 1 ? "" : "s"} ·{" "}
                    {snap.source}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {snap.paths.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && timeline.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No version history yet. Edits and agent writes will appear here.
            </p>
          )}
          {timeline.map((entry) => (
            <button
              key={`${entry.path}-${entry.version}-${entry.createdAt}`}
              type="button"
              onClick={() => void showDiff(entry)}
              className={cn(
                "mb-1 block w-full rounded px-2 py-2 text-left",
                selected?.path === entry.path &&
                  selected?.version === entry.version
                  ? "bg-primary/15"
                  : "hover:bg-secondary/60"
              )}
            >
              <div className="truncate font-mono text-xs text-foreground">
                {entry.path}
              </div>
              <div className="text-[11px] text-muted-foreground">
                v{entry.version} · {entry.source} ·{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </div>
            </button>
          ))}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Select a history entry to compare
            </div>
          ) : diffLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Loading diff…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="font-mono text-xs">
                  {selected.path} — v{selected.version}
                </span>
                <Button
                  className="px-2 py-1 text-xs"
                  loading={restoring}
                  onClick={() => void restore()}
                >
                  Restore this version
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <DiffEditor
                  original={before}
                  modified={after}
                  language={languageForPath(selected.path)}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
