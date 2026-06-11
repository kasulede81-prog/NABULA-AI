"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, FileCode } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileSearchPaletteProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

export function FileSearchPalette({
  projectId,
  open,
  onClose,
  onOpenFile,
}: FileSearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{
      path: string;
      snippet: string;
      kind?: "file" | "symbol";
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      void api
        .searchProjectFiles(projectId, query.trim())
        .then(async (res) => {
          if (res.data.length >= 3) {
            setResults(res.data);
            setActiveIdx(0);
            return;
          }
          const semantic = await api
            .semanticCodebaseSearch(projectId, query.trim(), 12)
            .catch(() => ({ data: [] }));
          const merged = [
            ...res.data,
            ...semantic.data.map((hit) => ({
              path: hit.path,
              snippet: `${hit.reason} — ${hit.snippet}`,
              kind: "file" as const,
            })),
          ];
          const seen = new Set<string>();
          setResults(
            merged.filter((r) => {
              if (seen.has(r.path)) return false;
              seen.add(r.path);
              return true;
            })
          );
          setActiveIdx(0);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, projectId, query]);

  const pick = useCallback(
    (path: string) => {
      onOpenFile(path);
      onClose();
    },
    [onClose, onOpenFile]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files & symbols… (Cmd+K)"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && results[activeIdx]) {
                pick(results[activeIdx].path);
              }
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-1">
          {loading && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
          )}
          {!loading && query.trim().length < 2 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Type at least 2 characters
            </p>
          )}
          {!loading &&
            query.trim().length >= 2 &&
            results.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No matches found
              </p>
            )}
          {results.map((row, idx) => (
            <button
              key={`${row.kind ?? "file"}:${row.path}:${row.snippet}`}
              type="button"
              onClick={() => pick(row.path)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-smooth",
                idx === activeIdx
                  ? "bg-sidebar-accent text-foreground"
                  : "hover:bg-secondary/60"
              )}
            >
              <FileCode className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs">{row.path}</span>
                  {row.kind === "symbol" && (
                    <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] text-primary">
                      symbol
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {row.snippet}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
