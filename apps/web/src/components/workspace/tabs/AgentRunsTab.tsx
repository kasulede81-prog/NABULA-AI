"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Square, Bot } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type AgentRun = {
  id: string;
  agentType: string;
  status: string;
  inputPrompt: string;
  outputSummary: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  llmProvider: string | null;
  toolCalls: number | null;
  filesGenerated: number | null;
  buildDurationMs: number | null;
  startedAt: string;
  completedAt: string | null;
};

type QueueJob = {
  id: string;
  kind: string;
  status: string;
  priority: number;
  waitForIdle: boolean;
  errorMessage: string | null;
  createdAt: string;
};

export function AgentRunsTab({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [queuePending, setQueuePending] = useState(0);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [runsRes, queueRes] = await Promise.all([
        api.listAgentRuns(projectId),
        api.listAgentQueue(projectId),
      ]);
      setRuns(runsRes.data);
      setActive(runsRes.active);
      setQueue(queueRes.data);
      setQueuePending(queueRes.pending);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => clearInterval(interval);
  }, [load]);

  const cancel = async (runId: string) => {
    setCancelling(runId);
    try {
      await api.cancelAgentRun(projectId, runId);
      await load();
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading agent runs…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agent runs</h2>
          <p className="text-sm text-muted-foreground">
            Background queue, clarifier, and builder tasks
          </p>
        </div>
        {queuePending > 0 && (
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary">
            {queuePending} queued
          </span>
        )}
        {active && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs text-warning">
            <Loader2 className="h-3 w-3 animate-spin" />
            Active
          </span>
        )}
      </div>
      {queue.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card/30 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Task queue
          </h3>
          <div className="space-y-1">
            {queue.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="capitalize text-foreground">{job.kind}</span>
                <span className="text-muted-foreground">
                  {job.status}
                  {job.priority > 0 ? " · priority" : ""}
                  {job.waitForIdle ? " · wait idle" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto">
        {runs.length === 0 && (
          <p className="text-sm text-muted-foreground">No agent runs yet.</p>
        )}
        {runs.map((run) => (
          <div
            key={run.id}
            className="rounded-lg border border-border bg-card/50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium capitalize">
                  {run.agentType}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] capitalize",
                    run.status === "running" && "bg-warning/15 text-warning",
                    run.status === "completed" && "bg-success/15 text-success",
                    run.status === "failed" && "bg-destructive/15 text-destructive"
                  )}
                >
                  {run.status}
                </span>
                {run.llmProvider && (
                  <span className="text-[10px] text-muted-foreground">
                    {run.llmProvider}
                  </span>
                )}
              </div>
              {run.status === "running" && (
                <button
                  type="button"
                  disabled={cancelling === run.id}
                  onClick={() => void cancel(run.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                >
                  <Square className="h-3 w-3" />
                  Cancel
                </button>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {run.outputSummary ?? run.inputPrompt}
            </p>
            {run.errorMessage && (
              <p className="mt-1 text-xs text-destructive">{run.errorMessage}</p>
            )}
            <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
              {run.toolCalls != null && <span>{run.toolCalls} tools</span>}
              {run.filesGenerated != null && (
                <span>{run.filesGenerated} files</span>
              )}
              {run.buildDurationMs != null && (
                <span>{Math.round(run.buildDurationMs / 1000)}s</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
