"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type Deployment = {
  id: string;
  status: string;
  target: string;
  url: string | null;
  commitMessage: string | null;
  branch: string;
  createdAt: string;
  logs: unknown;
  error: string | null;
};

type LogLine = { t: string; level: string; msg: string };

const statusColor: Record<string, string> = {
  ready: "bg-success",
  building: "bg-warning",
  deploying: "bg-warning",
  queued: "bg-muted-foreground",
  error: "bg-destructive",
  canceled: "bg-muted-foreground",
};

export function DeploymentsTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Deployment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjectDeployments(projectId);
      setRows(res.data as Deployment[]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 3000);
    return () => clearInterval(interval);
  }, [load]);

  const selectedLogs = Array.isArray(selected?.logs)
    ? (selected!.logs as LogLine[])
    : [];

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Cloud className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Deployments</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {rows.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-auto scrollbar-thin">
          {loading && rows.length === 0 && (
            <div className="grid h-32 place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No deployments yet. Click <strong>Deploy</strong> to ship.
            </div>
          )}
          <div className="divide-y divide-border">
            {rows.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-smooth hover:bg-secondary/40",
                  selected?.id === d.id && "bg-secondary/60"
                )}
              >
                <div className="relative">
                  <span
                    className={cn(
                      "block h-2.5 w-2.5 rounded-full",
                      statusColor[d.status] || "bg-muted"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {d.commitMessage || "Deploy"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <span className="uppercase">{d.target}</span>
                    <span>·</span>
                    <span>{d.branch}</span>
                    <span>·</span>
                    <span>{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {d.status}
                </span>
              </button>
            ))}
          </div>
        </div>
        {selected && (
          <div className="flex w-[420px] flex-col border-l border-border">
            <div className="flex h-10 items-center gap-2 border-b border-border px-4">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  statusColor[selected.status]
                )}
              />
              <span className="text-xs font-semibold uppercase">
                {selected.status}
              </span>
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  <Globe className="h-3 w-3" />{" "}
                  {selected.url.replace("https://", "")}
                </a>
              )}
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin font-mono text-xs">
              {selectedLogs.map((l, i) => (
                <div
                  key={i}
                  className="flex gap-3 border-b border-border/40 px-4 py-1.5"
                >
                  <span className="shrink-0 text-muted-foreground/60">
                    {new Date(l.t).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "w-10 shrink-0 text-[10px] font-bold uppercase",
                      l.level === "ok" && "text-success",
                      l.level === "warn" && "text-warning",
                      l.level === "error" && "text-destructive",
                      l.level === "info" && "text-primary"
                    )}
                  >
                    {l.level}
                  </span>
                  <span>{l.msg}</span>
                </div>
              ))}
              {selected.error && (
                <div className="px-4 py-2 text-xs text-destructive">
                  {selected.error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
