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
  streaming?: boolean;
}

type ChatMode = "ask" | "agent" | "composer";

interface ChatPanelProps {
  projectId: string;
  projectStatus: string;
  sseEvents: SseMessage[];
  onStatusChange?: (status: string) => void;
}

function placeholderForStatus(status: string, mode: ChatMode): string {
  if (mode === "ask") {
    return "Ask a question about your project… Use @path, @folder:src, or @codebase";
  }
  if (mode === "composer") {
    return "Describe changes… All edits go through review. Use @folder:src or @codebase";
  }
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
    if (
      !path ||
      path === "codebase" ||
      path === "web" ||
      path.startsWith("web:") ||
      path.startsWith("docs:")
    ) {
      continue;
    }
    if (path.includes("/") || path.includes(".")) {
      paths.add(path);
    }
  }
  return [...paths];
}

type MessageSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string; lang: string; path: string | null };

const PATH_TOKEN_RE = /^[\w.@-]+(?:\/[\w.@\[\]-]+)+\.\w+$/;

/** Split assistant content into text and ```code``` segments with file paths. */
function parseMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fenceRe = /```([^\n]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  for (const match of content.matchAll(fenceRe)) {
    if (match.index! > lastIndex) {
      segments.push({ kind: "text", text: content.slice(lastIndex, match.index) });
    }
    const info = (match[1] ?? "").trim();
    let code = match[2] ?? "";
    let path: string | null = null;
    // Path in the fence info string: ```tsx src/app/page.tsx
    for (const token of info.split(/\s+/)) {
      if (PATH_TOKEN_RE.test(token)) {
        path = token;
        break;
      }
    }
    // Or a leading comment: // src/app/page.tsx
    if (!path) {
      const first = code.split("\n", 1)[0]?.trim() ?? "";
      const m = /^(?:\/\/|#|<!--)\s*([\w.@-]+(?:\/[\w.@\[\]-]+)+\.\w+)/.exec(first);
      if (m) {
        path = m[1];
        code = code.split("\n").slice(1).join("\n");
      }
    }
    const lang = info.split(/\s+/)[0] ?? "";
    segments.push({ kind: "code", code: code.replace(/\n$/, ""), lang, path });
    lastIndex = match.index! + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: "text", text: content.slice(lastIndex) });
  }
  return segments;
}

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface AttachedImage {
  mediaType: string;
  data: string;
  name: string;
}

async function fileToAttachedImage(file: File): Promise<AttachedImage | null> {
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return null;
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return {
    mediaType: file.type,
    data: btoa(binary),
    name: file.name || "image",
  };
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
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [applyingBlock, setApplyingBlock] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastEventCount = useRef(0);
  const streamBuffers = useRef(new Map<string, string>());

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
    // Filter by monotonic seq — array length stalls at the ring-buffer cap,
    // so index-based tracking would stop processing events after ~100.
    const newEvents = sseEvents.filter((e) => e.seq > lastEventCount.current);
    if (newEvents.length === 0) return;
    lastEventCount.current = newEvents[newEvents.length - 1].seq;

    let shouldReload = false;

    for (const event of newEvents) {
      if (event.type === SseEvents.MESSAGE_DELTA) {
        const data = event.data as {
          streamId?: string;
          delta?: string;
          done?: boolean;
          messageId?: string;
        };
        if (!data.streamId) continue;

        if (data.done) {
          streamBuffers.current.delete(data.streamId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.streamId
                ? {
                    ...m,
                    id: data.messageId ?? m.id,
                    streaming: false,
                  }
                : m
            )
          );
          continue;
        }

        const delta = data.delta ?? "";
        const prev = streamBuffers.current.get(data.streamId) ?? "";
        const next = prev + delta;
        streamBuffers.current.set(data.streamId, next);

        setMessages((prev) => {
          const existing = prev.find((m) => m.id === data.streamId);
          if (existing) {
            return prev.map((m) =>
              m.id === data.streamId
                ? { ...m, content: next, streaming: true }
                : m
            );
          }
          return [
            ...prev,
            {
              id: data.streamId!,
              role: "assistant",
              content: next,
              createdAt: new Date().toISOString(),
              streaming: true,
            },
          ];
        });
      }

      if (event.type === SseEvents.MESSAGE_CREATED) {
        const msg = event.data as unknown as Message & { streamId?: string };
        if (msg?.id) {
          setMessages((prev) => {
            if (msg.streamId && prev.some((m) => m.id === msg.streamId)) {
              return prev.map((m) =>
                m.id === msg.streamId
                  ? { ...msg, streaming: false }
                  : m
              );
            }
            return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
          });
          if (msg.streamId) streamBuffers.current.delete(msg.streamId);
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

  const specialMentions: Array<{ label: string; insert: string }> = [];
  if (mentionQuery !== null) {
    const q = mentionQuery.toLowerCase();
    if ("codebase".startsWith(q) || q === "") {
      specialMentions.push({ label: "@codebase", insert: "@codebase " });
    }
    if ("web".startsWith(q) || q === "") {
      specialMentions.push({ label: "@web (search the web)", insert: "@web " });
    }
    if (q.startsWith("docs") || "docs:".startsWith(q)) {
      specialMentions.push({
        label: "@docs:url (fetch documentation)",
        insert: "@docs:https://",
      });
    }
    if (q.startsWith("folder:") || "folder:".startsWith(q)) {
      const folderQ = q.startsWith("folder:") ? q.slice(7) : "";
      const folders = new Set<string>();
      for (const p of filePaths) {
        const parts = p.split("/");
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join("/");
          if (!folderQ || prefix.toLowerCase().includes(folderQ)) {
            folders.add(prefix);
          }
        }
      }
      for (const f of [...folders].sort().slice(0, 4)) {
        specialMentions.push({
          label: `@folder:${f}`,
          insert: `@folder:${f} `,
        });
      }
    }
  }

  const mentionMatches =
    mentionQuery === null
      ? []
      : filePaths
          .filter((p) =>
            p.toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 8);

  const allMentionOptions = [
    ...specialMentions.map((s) => ({ kind: "special" as const, ...s })),
    ...mentionMatches.map((p) => ({
      kind: "file" as const,
      label: `@${p}`,
      insert: `@${p} `,
    })),
  ];

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

  const insertMention = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = input.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) return;
    const next = `${input.slice(0, at)}${text}${input.slice(cursor)}`;
    setInput(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = at + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !input.trim() ||
      sending ||
      (building && (chatMode === "agent" || chatMode === "composer"))
    )
      return;

    setSending(true);
    setSendError(null);
    try {
      const attached = extractMentionPaths(input);
      const msg = await api.sendMessage(projectId, input.trim(), {
        llmProvider: selected || undefined,
        attachedFiles: attached.length ? attached : undefined,
        chatMode,
        images: images.length
          ? images.map((img) => ({
              mediaType: img.mediaType,
              data: img.data,
            }))
          : undefined,
      });
      setMessages((prev) => [...prev, msg]);
      setInput("");
      setImages([]);
      setMentionQuery(null);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setSendError(apiErr.error?.message ?? "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const addImageFiles = async (files: FileList | File[]) => {
    const next: AttachedImage[] = [];
    for (const file of Array.from(files)) {
      if (images.length + next.length >= 3) break;
      const img = await fileToAttachedImage(file);
      if (img) next.push(img);
    }
    if (next.length > 0) setImages((prev) => [...prev, ...next].slice(0, 3));
  };

  const handleRestoreCheckpoint = async (msg: Message) => {
    if (restoringId) return;
    if (
      !window.confirm(
        "Restore the project files to their state at this message? Changes made after it will be reverted."
      )
    ) {
      return;
    }
    setRestoringId(msg.id);
    try {
      await api.restoreCheckpoint(projectId, msg.createdAt);
    } finally {
      setRestoringId(null);
    }
  };

  const handleApplyCodeBlock = async (
    blockKey: string,
    path: string,
    code: string
  ) => {
    if (applyingBlock) return;
    setApplyingBlock(blockKey);
    try {
      await api.stageChangesetEntry(projectId, path, code);
    } finally {
      setApplyingBlock(null);
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

  const isDisabled =
    sending || (building && (chatMode === "agent" || chatMode === "composer"));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setChatMode("ask")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                chatMode === "ask"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setChatMode("agent")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                chatMode === "agent"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => setChatMode("composer")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                chatMode === "composer"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="All changes require review before applying"
            >
              Composer
            </button>
          </div>
          {providers.length > 1 && (
            <select
              value={selected}
              onChange={(e) => {
                const id = e.target.value;
                if (id) setSelected(id as Parameters<typeof setSelected>[0]);
              }}
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
              "group rounded-lg px-3 py-2 text-sm",
              msg.role === "user"
                ? "ml-8 bg-primary/15 text-foreground"
                : msg.role === "system"
                  ? "bg-muted/40 text-muted-foreground text-xs"
                  : "mr-8 bg-card text-foreground"
            )}
          >
            <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase text-muted-foreground">
              <span>
                {msg.role}
                {msg.streaming ? " · typing…" : ""}
              </span>
              {msg.role === "user" && !msg.streaming && (
                <button
                  type="button"
                  onClick={() => void handleRestoreCheckpoint(msg)}
                  disabled={restoringId !== null}
                  className="invisible normal-case text-[10px] text-muted-foreground hover:text-foreground group-hover:visible disabled:opacity-50"
                  title="Restore project files to their state at this message"
                >
                  {restoringId === msg.id ? "Restoring…" : "↺ Restore checkpoint"}
                </button>
              )}
            </div>
            {msg.role === "assistant" && !msg.streaming ? (
              <div className="space-y-2">
                {parseMessageSegments(msg.content).map((seg, i) =>
                  seg.kind === "text" ? (
                    seg.text.trim() ? (
                      <p key={i} className="whitespace-pre-wrap">
                        {seg.text.trim()}
                      </p>
                    ) : null
                  ) : (
                    <div
                      key={i}
                      className="overflow-hidden rounded-md border border-border"
                    >
                      {(seg.path || seg.lang) && (
                        <div className="flex items-center justify-between bg-secondary/50 px-2 py-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {seg.path ?? seg.lang}
                          </span>
                          {seg.path && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleApplyCodeBlock(
                                  `${msg.id}:${i}`,
                                  seg.path!,
                                  seg.code
                                )
                              }
                              disabled={applyingBlock !== null}
                              className="rounded bg-primary/20 px-2 py-0.5 text-[10px] text-foreground hover:bg-primary/30 disabled:opacity-50"
                            >
                              {applyingBlock === `${msg.id}:${i}`
                                ? "Staging…"
                                : "Apply"}
                            </button>
                          )}
                        </div>
                      )}
                      <pre className="max-h-72 overflow-auto bg-[#16161e] p-2 font-mono text-xs leading-relaxed">
                        {seg.code}
                      </pre>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}
          </div>
        ))}
        {building && (chatMode === "agent" || chatMode === "composer") && (
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
        {sendError && (
          <div className="mb-2 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">
            {sendError}
          </div>
        )}
        {mentionQuery !== null && allMentionOptions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-elegant">
            {allMentionOptions.map((opt, idx) => (
              <button
                key={`${opt.kind}:${opt.label}`}
                type="button"
                onClick={() => insertMention(opt.insert)}
                className={cn(
                  "block w-full truncate px-3 py-1.5 text-left font-mono text-xs",
                  idx === mentionIdx
                    ? "bg-sidebar-accent text-foreground"
                    : "hover:bg-secondary/60",
                  opt.kind === "special" && "text-primary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="h-8 w-8 rounded object-cover"
                />
                <span className="max-w-[120px] truncate text-[10px] text-muted-foreground">
                  {img.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter(
              (f) => IMAGE_TYPES.has(f.type)
            );
            if (files.length > 0) {
              e.preventDefault();
              void addImageFiles(files);
            }
          }}
          placeholder={placeholderForStatus(projectStatus, chatMode)}
          rows={2}
          disabled={isDisabled}
          className="mb-2 w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          onKeyDown={(e) => {
            if (allMentionOptions.length > 0 && mentionQuery !== null) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIdx((i) =>
                  Math.min(i + 1, allMentionOptions.length - 1)
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIdx((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                insertMention(allMentionOptions[mentionIdx].insert);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            loading={sending}
            disabled={!input.trim() || isDisabled}
          >
            {chatMode === "ask"
              ? "Ask"
              : chatMode === "composer"
                ? "Compose"
                : "Send"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addImageFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled || images.length >= 3}
            className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Attach images (or paste) — analyzed in Ask mode"
          >
            📎 Image
          </button>
        </div>
      </form>
    </div>
  );
}
