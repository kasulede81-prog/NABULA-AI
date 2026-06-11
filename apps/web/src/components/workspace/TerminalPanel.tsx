"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SseEvents } from "@nebula/shared";
import type { SseMessage } from "@/hooks/useSSE";

interface TerminalPanelProps {
  projectId: string;
  sseEvents: SseMessage[];
}

export function TerminalPanel({ projectId, sseEvents }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const handleAiCommand = useCallback(async () => {
    const instruction = aiPrompt.trim();
    if (!instruction || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await api.aiTerminalCommand(projectId, instruction);
      const command = res.data.command;
      if (command && wsRef.current?.readyState === WebSocket.OPEN) {
        // Type the command into the shell without executing — user presses Enter.
        wsRef.current.send(JSON.stringify({ type: "stdin", data: command }));
        termRef.current?.focus();
        setAiPrompt("");
      }
    } catch {
      /* best-effort */
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiBusy, projectId]);

  const checkPreview = useCallback(async () => {
    try {
      const res = await api.getPreview(projectId);
      const preview = res.data;
      setPreviewReady(preview?.status === "ready" && !!preview?.sandboxId);
      return preview?.status === "ready";
    } catch {
      setPreviewReady(false);
      return false;
    }
  }, [projectId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    disconnect();
    setError(null);
    setStatus("connecting");

    const ready = await checkPreview();
    if (!ready) {
      setStatus("error");
      setError("Start a preview first — the terminal runs inside the preview sandbox.");
      return;
    }

    const { Terminal } = await import("xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    if (!document.querySelector('link[data-xterm-css="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css";
      link.dataset.xtermCss = "1";
      document.head.appendChild(link);
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    if (containerRef.current) {
      terminal.open(containerRef.current);
      fitAddon.fit();
    }

    termRef.current = terminal;
    fitRef.current = fitAddon;

    const url = api.getTerminalWsUrl(projectId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: dims.cols,
            rows: dims.rows,
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type: string;
          data?: string;
          message?: string;
        };
        if (msg.type === "output" && msg.data) {
          terminal.write(msg.data);
        }
        if (msg.type === "ready") {
          setStatus("ready");
        }
        if (msg.type === "error") {
          setStatus("error");
          setError(msg.message ?? "Terminal error");
        }
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setError("WebSocket connection failed");
    };

    ws.onclose = () => {
      setStatus((s) => (s === "error" ? s : "idle"));
    };

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stdin", data }));
      }
    });

    const onResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: dims.cols,
            rows: dims.rows,
          })
        );
      }
    };
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [checkPreview, disconnect, projectId]);

  useEffect(() => {
    void checkPreview();
  }, [checkPreview]);

  useEffect(() => {
    const last = sseEvents[sseEvents.length - 1];
    if (!last) return;
    if (
      last.type === SseEvents.PREVIEW_READY ||
      last.type === SseEvents.PREVIEW_DELETED ||
      last.type === SseEvents.PREVIEW_EXPIRED ||
      last.type === SseEvents.PREVIEW_FAILED
    ) {
      void checkPreview();
      if (
        last.type === SseEvents.PREVIEW_DELETED ||
        last.type === SseEvents.PREVIEW_EXPIRED
      ) {
        disconnect();
      }
    }
  }, [sseEvents, checkPreview, disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold text-foreground">Terminal</h3>
          <p className="text-[11px] text-muted-foreground">
            Shell inside the live preview sandbox
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() => void connect()}
            disabled={status === "connecting"}
          >
            {status === "ready" ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!previewReady && status === "idle" && (
        <div className="px-3 py-2 text-xs text-amber-400/90">
          Preview is not running. Open the Preview tab and start a preview, then connect
          here.
        </div>
      )}

      {status === "ready" && (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-3 py-1.5">
          <span className="shrink-0 text-[11px] text-primary">AI</span>
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAiCommand();
              }
            }}
            placeholder="Describe a command… (e.g. install zod and run the build)"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            disabled={aiBusy}
          />
          <button
            type="button"
            onClick={() => void handleAiCommand()}
            disabled={aiBusy || !aiPrompt.trim()}
            className="shrink-0 rounded bg-primary/20 px-2 py-0.5 text-[11px] text-foreground disabled:opacity-40"
          >
            {aiBusy ? "…" : "Generate"}
          </button>
        </div>
      )}

      <div ref={containerRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
