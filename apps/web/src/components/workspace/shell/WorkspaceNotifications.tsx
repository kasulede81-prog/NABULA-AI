"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { SseEvents } from "@nebula/shared";
import type { SseMessage } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";

export interface ProjectNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface WorkspaceNotificationsProps {
  projectId: string;
  sseEvents: SseMessage[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

export function WorkspaceNotifications({
  projectId,
  sseEvents,
}: WorkspaceNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProjectNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastEventCount = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjectNotifications(projectId);
      setItems(res.data);
      setUnread(res.unread);
    } catch {
      /* keep current list; reopening the bell retries */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Filter by monotonic seq — array length stalls at the ring-buffer cap
    // and resets on project switch, so index tracking would stop working.
    const newEvents = sseEvents.filter((e) => e.seq > lastEventCount.current);
    if (newEvents.length === 0) return;
    lastEventCount.current = newEvents[newEvents.length - 1].seq;

    for (const event of newEvents) {
      if (event.type === SseEvents.NOTIFICATION_CREATED) {
        const row = event.data as unknown as ProjectNotification;
        if (row?.id) {
          setItems((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev].slice(0, 30);
          });
          setUnread((u) => u + 1);
        }
      }
    }
  }, [sseEvents]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = async (id: string) => {
    await api.markProjectNotificationRead(projectId, id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAllRead = async () => {
    await api.markAllProjectNotificationsRead(projectId);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative grid h-8 w-8 place-items-center rounded-md transition-smooth hover:bg-secondary"
        title="Notifications"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-elegant">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {loading && items.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Loading…
              </p>
            )}
            {!loading && items.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No notifications yet
              </p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) void markRead(n.id);
                }}
                className={cn(
                  "block w-full border-b border-border/50 px-3 py-2.5 text-left transition-smooth hover:bg-secondary/40",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium">{n.title}</span>
                  {!n.read && (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                {n.body && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {n.body}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {formatTime(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
