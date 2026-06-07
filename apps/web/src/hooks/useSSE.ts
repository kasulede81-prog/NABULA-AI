"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { SseEventType } from "@nebula/shared";

export interface SseMessage {
  type: SseEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export function useSSE(projectId: string | null) {
  const [events, setEvents] = useState<SseMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!projectId) return;

    const token = api.getToken();
    if (!token) return;

    const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1"}/projects/${projectId}/events`;

    // EventSource doesn't support custom headers — use fetch-based SSE polyfill
    const controller = new AbortController();
    let buffer = "";

    async function connect() {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setConnected(false);
          return;
        }

        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim() || part.startsWith(":")) continue;

            const lines = part.split("\n");
            let eventType = "message";
            let data = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              if (line.startsWith("data: ")) data = line.slice(6);
            }

            if (data) {
              try {
                const parsed = JSON.parse(data) as SseMessage;
                setEvents((prev) => [...prev.slice(-99), parsed]);
              } catch {
                // ignore malformed
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setConnected(false);
        }
      }
    }

    connect();

    return () => {
      controller.abort();
      setConnected(false);
    };
  }, [projectId]);

  return { events, connected, clearEvents };
}
