"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/admin/ui";

interface ConversationSummary {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: string;
  unreadCount: number;
  lastMessage: {
    message: string;
    senderType: string;
    createdAt: string;
  } | null;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  senderType: string;
  message: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  messages: ChatMessage[];
}

export default function AdminSupportPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminSupportConversations();
      setConversations(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api.getAdminSupportConversation(id);
      setDetail(res.data);
      setSelectedId(id);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load conversation");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSend = async () => {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.sendAdminSupportMessage(selectedId, reply.trim());
      setDetail((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, res.data] }
          : prev
      );
      setReply("");
      void loadList();
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error && conversations.length === 0) {
    return <ErrorState message={error} onRetry={loadList} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Support</h1>
        <p className="text-sm text-gray-500">User conversations and replies</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="rounded-lg border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-3 py-2 text-xs font-medium text-gray-400">
            Conversations ({conversations.length})
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {conversations.length === 0 ? (
              <li className="px-3 py-4 text-xs text-gray-500">No open conversations</li>
            ) : (
              conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void loadDetail(c.id)}
                    className={`w-full px-3 py-3 text-left text-xs hover:bg-surface ${
                      selectedId === c.id ? "bg-surface" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">{c.userName}</span>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-gray-500">{c.userEmail}</p>
                    {c.lastMessage && (
                      <p className="mt-1 truncate text-gray-600">
                        {c.lastMessage.message}
                      </p>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="flex min-h-[400px] flex-col rounded-lg border border-surface-border bg-surface-card">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Select a conversation
            </div>
          ) : detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Loading...
            </div>
          ) : detail ? (
            <>
              <div className="border-b border-surface-border px-4 py-3">
                <p className="text-sm font-medium text-white">{detail.userName}</p>
                <p className="text-xs text-gray-500">{detail.userEmail}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.senderType === "admin" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                        m.senderType === "admin"
                          ? "bg-nebula-700 text-white"
                          : "bg-surface-border text-gray-200"
                      }`}
                    >
                      {m.message}
                      <p className="mt-1 text-[10px] opacity-60">
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-surface-border p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="Reply to user..."
                    className="flex-1 rounded border border-surface-border bg-surface px-3 py-2 text-xs text-white"
                  />
                  <Button
                    className="px-3 py-2 text-xs"
                    onClick={handleSend}
                    loading={sending}
                    disabled={!reply.trim()}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
