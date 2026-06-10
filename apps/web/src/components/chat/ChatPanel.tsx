"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useLlmProvider } from "@/hooks/useLlmProvider";
import type { SseMessage } from "@/hooks/useSSE";
import { SseEvents } from "@nebula/shared";
import { cn } from "@/lib/utils";

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
      return "Answer the clarification questions… Use @path to attach files";
    case "building":
      return "Build in progress — watch the activity feed…";
    case "failed":
      return "Describe what to fix or type 'retry' to rebuild…";
    case "ready":
      return "Describe changes… Use @src/app/page.tsx to attach context";
    default:
      return "Describe your app… Use @file paths for context";
  }
}

function extractMentionPaths(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(/@([^\s@]+)/g)) {
    const path = match[1]?.trim();
    if (path && (path.includes("/") || path.includes("."))) {
      paths.add(path);
    }
  }
  return [...paths];
}

export function ChatPanel({
  projectId,
  projectStatus,
  sseEvents,
  onStatusChange,
}: ChatPanelProps) {
  const { providers, selected, setSelected } = useLlmProvider(projectId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastEventCount = useRef(0);

  const loadMessages = useCallback(async () => {
    const res = await api.listMessages(projectId, { fetchAll: true });
    setMessages(res.data);
  }, [projectId]);

  useEffect(() => {
    loadMessages();
    void api.listFiles(projectId).then((res) =>
      setFilePaths(res.data.map((f) => f.path))
    );
  }, [loadMessages, projectId]);

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

  const mentionMatches =
    mentionQuery === null
      ? []
      : filePaths
          .filter((p) =>
            p.toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 8);

  const updateMentionState = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at >= 0 && !before.slice(at).includes(" ")) {
      setMentionQuery(before.slice(at + 1));
      setMentionIdx(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (path: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = input.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) return;
    const next = `${input.slice(0, at)}@${path} ${input.slice(cursor)}`;
    setInput(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = at + path.length + 2;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending || building) return;

    setSending(true);
    try {
      const attached = extractMentionPaths(input);
      const msg = await api.sendMessage(projectId, input.trim(), {
        llmProvider: selected || undefined,
        attachedFiles: attached.length ? attached : undefined,
      });
      setMessages((prev) => [...prev, msg]);
      setInput("");
      setMentionQuery(null);
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <select
              value={selected}
              onChange={(e) =>
                setSelected(e.target.value as "anthropic" | "deepseek")
              }
              className="rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11px] text-foreground"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          {projectStatus === "failed" && (
            <Button
              onClick={handleRetryBuild}
              loading={building}
              className="px-3 py-1 text-xs"
            >
              Retry Build
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              msg.role === "user"
                ? "ml-8 bg-primary/15 text-foreground"
                : msg.role === "system"
                  ? "bg-muted/40 text-muted-foreground text-xs"
                  : "mr-8 bg-card text-foreground"
            )}
          >
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {msg.role}
            </div>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {building && (
          <div className="mr-8 rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">
            <div className="mb-1 text-xs font-medium uppercase text-primary">
              agent
            </div>
            <p className="animate-pulse">Building your application…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="relative border-t border-border p-4">
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-elegant">
            {mentionMatches.map((path, idx) => (
              <button
                key={path}
                type="button"
                onClick={() => insertMention(path)}
                className={cn(
                  "block w-full truncate px-3 py-1.5 text-left font-mono text-xs",
                  idx === mentionIdx
                    ? "bg-sidebar-accent text-foreground"
                    : "hover:bg-secondary/60"
                )}
              >
                @{path}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            updateMentionState(e.target.value, e.target.selectionStart);
          }}
          placeholder={placeholderForStatus(projectStatus)}
          rows={2}
          disabled={isDisabled}
          className="mb-2 w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          onKeyDown={(e) => {
            if (mentionMatches.length > 0 && mentionQuery !== null) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIdx((i) => Math.min(i + 1, mentionMatches.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIdx((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                insertMention(mentionMatches[mentionIdx]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <Button
          type="submit"
          loading={sending}
          disabled={!input.trim() || isDisabled}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
