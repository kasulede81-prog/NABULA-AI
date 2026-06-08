"use client";

import type { SseMessage } from "@/hooks/useSSE";

interface ProgressFeedProps {
  events: SseMessage[];
  connected: boolean;
}

export function ProgressFeed({ events, connected }: ProgressFeedProps) {
  const progressEvents = events.filter(
    (e) =>
      e.type === "progress" ||
      e.type === "file.created" ||
      e.type === "file.updated" ||
      e.type === "file.deleted" ||
      e.type === "message.created" ||
      e.type === "agent.started" ||
      e.type === "agent.progress" ||
      e.type === "agent.completed" ||
      e.type === "agent.failed" ||
      e.type === "build.started" ||
      e.type === "build.completed" ||
      e.type === "build.failed" ||
      e.type === "preview.started" ||
      e.type === "preview.phase" ||
      e.type === "preview.log" ||
      e.type === "preview.ready" ||
      e.type === "preview.failed" ||
      e.type === "preview.deleted" ||
      e.type === "preview.expired"
  );

  return (
    <div className="border-t border-surface-border">
      <div className="flex items-center justify-between px-4 py-2">
        <h3 className="text-xs font-semibold uppercase text-gray-500">
          Activity
        </h3>
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-600"}`}
          title={connected ? "Connected" : "Disconnected"}
        />
      </div>
      <div className="max-h-32 overflow-y-auto px-4 pb-3 space-y-1">
        {progressEvents.length === 0 ? (
          <p className="text-xs text-gray-600">Waiting for activity...</p>
        ) : (
          progressEvents
            .slice(-10)
            .reverse()
            .map((event, i) => {
              const data = event.data as {
                message?: string;
                path?: string;
                tool?: string;
                agentType?: string;
                error?: string;
                errorCode?: string;
                phase?: string;
                retryCount?: number;
              };
              let detail =
                data.message ??
                data.path ??
                data.tool ??
                data.agentType ??
                data.error;
              if (event.type === "build.failed" && !detail) {
                const parts = [
                  data.phase && `phase ${data.phase}`,
                  data.errorCode,
                  data.error,
                  data.retryCount != null && `retries ${data.retryCount}`,
                ].filter(Boolean);
                detail = parts.join(" — ") || JSON.stringify(event.data).slice(0, 60);
              }
              if (!detail) {
                detail = JSON.stringify(event.data).slice(0, 60);
              }
              return (
                <p key={`${event.timestamp}-${i}`} className="text-xs text-gray-400">
                  <span className="text-nebula-500">{event.type}</span>
                  {" — "}
                  {detail}
                </p>
              );
            })
        )}
      </div>
    </div>
  );
}
