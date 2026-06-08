"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_URL } from "@nebula/shared";

interface ChatMessage {
  id: string;
  senderType: string;
  message: string;
  createdAt: string;
}

interface SupportChatPanelProps {
  open: boolean;
  onClose: () => void;
  onUpgradeRequest?: () => void;
  showUpgradeHint?: boolean;
}

export function SupportChatPanel({
  open,
  onClose,
  onUpgradeRequest,
  showUpgradeHint = false,
}: SupportChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSupportConversation();
      setMessages(res.data.messages);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.sendSupportMessage(text);
      setMessages((prev) => [...prev, res.data]);
      setInput("");
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleUpgrade = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await api.requestProUpgrade();
      setMessages(res.data.conversation.messages);
      onUpgradeRequest?.();
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to submit upgrade request");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex h-[min(520px,85vh)] w-full max-w-md flex-col rounded-lg border border-surface-border bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium text-white">Support</h3>
            <p className="text-xs text-gray-500">
              WhatsApp:{" "}
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nebula-400 hover:underline"
              >
                {SUPPORT_WHATSAPP_NUMBER}
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-xs text-gray-500">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-500">
              No messages yet. Say hello or request a Pro upgrade.
            </p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`flex ${m.senderType === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      m.senderType === "user"
                        ? "bg-nebula-700 text-white"
                        : "bg-surface-border text-gray-200"
                    }`}
                  >
                    <p>{m.message}</p>
                    <p className="mt-1 text-[10px] opacity-60">
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>

        {showUpgradeHint && (
          <div className="border-t border-surface-border px-4 py-2">
            <Button
              className="w-full py-2 text-xs"
              onClick={handleUpgrade}
              loading={sending}
            >
              Request Pro Upgrade
            </Button>
          </div>
        )}

        <div className="border-t border-surface-border p-3">
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 rounded border border-surface-border bg-surface px-3 py-2 text-xs text-white"
            />
            <Button
              className="px-3 py-2 text-xs"
              onClick={handleSend}
              loading={sending}
              disabled={!input.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
