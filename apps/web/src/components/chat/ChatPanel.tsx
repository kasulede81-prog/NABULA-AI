"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import type { SseMessage } from "@/hooks/useSSE";
import { SseEvents } from "@nebula/shared";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  projectId: string;
  projectStatus: string;
  sseEvents: SseMessage[];
  onStatusChange?: (status: string) => void;
}

function placeholderForStatus(status: string): string {
  switch (status) {
    case "clarifying":
      return "Answer the clarification questions above...";
    case "building":
      return "Build in progress — watch the activity feed...";
    case "failed":
      return "Describe what to fix or type 'retry' to rebuild...";
    case "ready":
      return "Describe changes to iterate on your app...";
    default:
      return "Describe your app or answer questions...";
  }
}

export function ChatPanel({
  projectId,
  projectStatus,
  sseEvents,
  onStatusChange,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastEventCount = useRef(0);

  const loadMessages = useCallback(async () => {
    const res = await api.listMessages(projectId, { fetchAll: true });
    setMessages(res.data);
  }, [projectId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (sseEvents.length <= lastEventCount.current) return;
    const newEvents = sseEvents.slice(lastEventCount.current);
    lastEventCount.current = sseEvents.length;

    let shouldReload = false;

    for (const event of newEvents) {
      if (event.type === SseEvents.MESSAGE_CREATED) {
        const msg = event.data as unknown as Message | undefined;
        if (msg?.id) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        } else {
          shouldReload = true;
        }
      }
      if (event.type === SseEvents.PROJECT_UPDATED) {
        const status = (event.data as { status?: string }).status;
        if (status) onStatusChange?.(status);
      }
      if (
        event.type === SseEvents.BUILD_STARTED ||
        event.type === SseEvents.AGENT_STARTED
      ) {
        setBuilding(true);
      }
      if (
        event.type === SseEvents.BUILD_COMPLETED ||
        event.type === SseEvents.BUILD_FAILED ||
        event.type === SseEvents.AGENT_COMPLETED ||
        event.type === SseEvents.AGENT_FAILED
      ) {
        setBuilding(false);
      }
    }

    if (shouldReload) loadMessages();
  }, [sseEvents, loadMessages, onStatusChange]);

  useEffect(() => {
    setBuilding(projectStatus === "building");
  }, [projectStatus]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending || building) return;

    setSending(true);
    try {
      const msg = await api.sendMessage(projectId, input.trim());
      setMessages((prev) => [...prev, msg]);
      setInput("");
    } finally {
      setSending(false);
    }
  };

  const handleRetryBuild = async () => {
    setBuilding(true);
    try {
      await api.triggerBuild(projectId);
    } catch {
      setBuilding(false);
    }
  };

  const isDisabled = sending || building;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Chat</h2>
        {projectStatus === "failed" && (
          <Button onClick={handleRetryBuild} loading={building} className="px-3 py-1 text-xs">
            Retry Build
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.role === "user"
                ? "ml-8 bg-nebula-600/20 text-white"
                : msg.role === "system"
                  ? "bg-surface-card text-gray-400 text-xs"
                  : "mr-8 bg-surface-card text-gray-200"
            }`}
          >
            <div className="mb-1 text-xs font-medium uppercase text-gray-500">
              {msg.role}
            </div>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {building && (
          <div className="mr-8 rounded-lg bg-surface-card px-3 py-2 text-sm text-gray-400">
            <div className="mb-1 text-xs font-medium uppercase text-nebula-500">
              agent
            </div>
            <p className="animate-pulse">Building your application...</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-surface-border p-4"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholderForStatus(projectStatus)}
          rows={2}
          disabled={isDisabled}
          className="mb-2 w-full resize-none rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-nebula-500 focus:outline-none disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <Button type="submit" loading={sending} disabled={!input.trim() || isDisabled}>
          Send
        </Button>
      </form>
    </div>
  );
}
