"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export function LogsTab({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<
    Array<{ t: string; level: string; msg: string; deployment: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjectPlatformLogs(projectId);
      setLogs(res.data);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Logs</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {logs.length} lines
        </span>
      </div>
      {loading && logs.length === 0 ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin font-mono text-xs">
          {logs.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              No logs yet
            </div>
          )}
          {logs.map((l, i) => (
            <div
              key={`${l.t}-${i}`}
              className="flex gap-3 border-b border-border/40 px-4 py-1.5 hover:bg-secondary/40"
            >
              <span className="shrink-0 text-muted-foreground/60">
                {new Date(l.t).toLocaleTimeString()}
              </span>
              <span className="shrink-0 text-muted-foreground/40">
                [{l.deployment}]
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
        </div>
      )}
    </div>
  );
}
