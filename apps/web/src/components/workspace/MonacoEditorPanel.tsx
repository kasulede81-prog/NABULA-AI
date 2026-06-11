"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditorTypes from "monaco-editor";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { languageForPath } from "@/lib/monaco-language";
import { AiEditModal } from "./AiEditModal";
import { InlineEditPopover } from "./InlineEditPopover";
import {
  registerProjectCompletions,
  type CodeSymbol,
} from "@/lib/monaco-completions";
import { registerAiTabCompletions } from "@/lib/monaco-ai-tab";
import {
  setupProjectIntelligence,
  syncProjectModel,
} from "@/lib/monaco-project-lsp";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-500">
      Loading editor...
    </div>
  ),
});

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

export interface EditorTab {
  path: string;
  content: string;
  savedContent: string;
  version: number | null;
}

export interface PendingFileChange {
  path: string;
  previousContent: string;
  newContent: string;
}

interface MonacoEditorPanelProps {
  projectId: string;
  tabs: EditorTab[];
  activePath: string | null;
  onTabsChange: (tabs: EditorTab[]) => void;
  onActivePathChange: (path: string | null) => void;
  onFileSaved: () => void;
  /** Open a file from go-to-definition (cross-file navigation). */
  onOpenFile?: (path: string) => void;
  /** Staged agent changes — shows Cursor-style inline diff with apply/reject. */
  pendingChanges?: PendingFileChange[];
  onPendingResolved?: (path: string) => void;
}

export function MonacoEditorPanel({
  projectId,
  tabs,
  activePath,
  onTabsChange,
  onActivePathChange,
  onFileSaved,
  onOpenFile,
  pendingChanges = [],
  onPendingResolved,
}: MonacoEditorPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [markerCount, setMarkerCount] = useState(0);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [inlineEditOpen, setInlineEditOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [inlineDiffOpen, setInlineDiffOpen] = useState(false);
  const [resolvingPending, setResolvingPending] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionDisposeRef = useRef<(() => void) | null>(null);
  const aiTabDisposeRef = useRef<(() => void) | null>(null);
  const lspDisposeRef = useRef<(() => void) | null>(null);
  const pendingRevealRef = useRef<{
    path: string;
    line?: number;
    column?: number;
  } | null>(null);
  const activePathRef = useRef<string | null>(activePath);
  activePathRef.current = activePath;
  // Ring buffer of recent edits — feeds Tab edit-prediction context.
  const recentEditsRef = useRef<string[]>([]);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  const [filePaths, setFilePaths] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.listCodeSymbols(projectId),
      api.listFiles(projectId),
      api.reindexCodebase(projectId).catch(() => undefined),
    ]).then(([symRes, filesRes]) => {
      if (cancelled) return;
      setSymbols(symRes.data);
      setFilePaths(filesRes.data.map((f) => f.path));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  const activePending =
    pendingChanges.find((c) => c.path === activePath) ?? null;
  const isDirty =
    activeTab != null && activeTab.content !== activeTab.savedContent;

  useEffect(() => {
    // Leaving a file closes its inline diff view.
    setInlineDiffOpen(false);
  }, [activePath]);

  const updateActiveContent = useCallback(
    (content: string) => {
      if (!activePath) return;
      const editor = editorRef.current;
      if (editor) {
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (pos && model && pos.lineNumber <= model.getLineCount()) {
          const line = model.getLineContent(pos.lineNumber).trim();
          if (line) {
            const entry = `${activePath}:${pos.lineNumber}: ${line.slice(0, 160)}`;
            const buf = recentEditsRef.current.filter(
              (e) => !e.startsWith(`${activePath}:${pos.lineNumber}:`)
            );
            buf.push(entry);
            recentEditsRef.current = buf.slice(-6);
          }
        }
      }
      onTabsChange(
        tabs.map((t) => (t.path === activePath ? { ...t, content } : t))
      );
    },
    [activePath, onTabsChange, tabs]
  );

  const collectActiveMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    if (!monaco || !activePathRef.current) return [];
    return monaco.editor
      .getModelMarkers({})
      .filter(
        (m: MonacoEditorTypes.editor.IMarker) =>
          m.resource.path.replace(/^\//, "") === activePathRef.current &&
          m.severity >= 8 // MarkerSeverity.Error
      );
  }, []);

  // Poll diagnostics so the "Fix with AI" button reflects current errors.
  useEffect(() => {
    const timer = setInterval(() => {
      setMarkerCount(collectActiveMarkers().length);
    }, 2000);
    return () => clearInterval(timer);
  }, [collectActiveMarkers]);

  const handleFixWithAi = useCallback(async () => {
    const tab = tabs.find((t) => t.path === activePathRef.current);
    if (!tab) return;
    const markers = collectActiveMarkers();
    if (markers.length === 0) return;
    setFixing(true);
    setError(null);
    try {
      const res = await api.aiQuickFix(projectId, {
        path: tab.path,
        content: tab.content,
        errors: markers
          .slice(0, 20)
          .map((m: MonacoEditorTypes.editor.IMarker) => ({
            line: m.startLineNumber,
            message: m.message,
          })),
      });
      const fixed = res.data.content;
      if (fixed && fixed !== tab.content) {
        onTabsChange(
          tabs.map((t) =>
            t.path === tab.path ? { ...t, content: fixed } : t
          )
        );
        if (monacoRef.current) {
          syncProjectModel(monacoRef.current, tab.path, fixed);
        }
      }
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "AI fix failed");
    } finally {
      setFixing(false);
    }
  }, [collectActiveMarkers, onTabsChange, projectId, tabs]);

  const handleSave = useCallback(async () => {
    if (!activeTab || activeTab.content === activeTab.savedContent) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.writeFile(
        projectId,
        activeTab.path,
        activeTab.content
      );
      onTabsChange(
        tabs.map((t) =>
          t.path === activeTab.path
            ? {
                ...t,
                savedContent: t.content,
                version: saved.version,
              }
            : t
        )
      );
      if (monacoRef.current) {
        syncProjectModel(monacoRef.current, activeTab.path, activeTab.content);
      }
      onFileSaved();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeTab, onFileSaved, onTabsChange, projectId, tabs]);

  const closeTab = (path: string) => {
    const next = tabs.filter((t) => t.path !== path);
    onTabsChange(next);
    if (activePath === path) {
      onActivePathChange(next.length > 0 ? next[next.length - 1].path : null);
    }
  };

  const handleAiApplied = (path: string, content: string, version: number) => {
    onTabsChange(
      tabs.map((t) =>
        t.path === path
          ? { ...t, content, savedContent: content, version }
          : t
      )
    );
    if (monacoRef.current) {
      syncProjectModel(monacoRef.current, path, content);
    }
    onFileSaved();
    setAiEditOpen(false);
  };

  const handleApplyPending = async () => {
    if (!activePending) return;
    setResolvingPending(true);
    setError(null);
    try {
      await api.applyChangeset(projectId, [activePending.path]);
      onTabsChange(
        tabs.map((t) =>
          t.path === activePending.path
            ? {
                ...t,
                content: activePending.newContent,
                savedContent: activePending.newContent,
              }
            : t
        )
      );
      if (monacoRef.current) {
        syncProjectModel(
          monacoRef.current,
          activePending.path,
          activePending.newContent
        );
      }
      setInlineDiffOpen(false);
      onPendingResolved?.(activePending.path);
      onFileSaved();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Apply failed");
    } finally {
      setResolvingPending(false);
    }
  };

  const handleRejectPending = async () => {
    if (!activePending) return;
    setResolvingPending(true);
    setError(null);
    try {
      await api.discardChangeset(projectId, [activePending.path]);
      setInlineDiffOpen(false);
      onPendingResolved?.(activePending.path);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Reject failed");
    } finally {
      setResolvingPending(false);
    }
  };

  const openInlineEdit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const text = model.getValueInRange(selection);
    if (!text.trim()) return;
    setSelectedText(text);
    setInlineEditOpen(true);
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        () => openInlineEdit()
      );
      completionDisposeRef.current?.();
      completionDisposeRef.current = registerProjectCompletions(
        monaco,
        symbols,
        filePaths
      );
      aiTabDisposeRef.current?.();
      aiTabDisposeRef.current = registerAiTabCompletions(
        monaco,
        projectId,
        () => activePathRef.current,
        () => recentEditsRef.current.join("\n")
      );
      if (!lspDisposeRef.current) {
        void setupProjectIntelligence(monaco, projectId, (path, line, column) => {
          pendingRevealRef.current = { path, line, column };
          if (path !== activePathRef.current) {
            onOpenFileRef.current?.(path);
          } else {
            revealPending(editor);
          }
        }).then((dispose) => {
          lspDisposeRef.current = dispose;
        });
      }
    },
    [openInlineEdit, symbols, filePaths, projectId]
  );

  const revealPending = (editor: Parameters<OnMount>[0]) => {
    const target = pendingRevealRef.current;
    if (!target || target.line == null) {
      pendingRevealRef.current = null;
      return;
    }
    editor.setPosition({
      lineNumber: target.line,
      column: target.column ?? 1,
    });
    editor.revealLineInCenter(target.line);
    editor.focus();
    pendingRevealRef.current = null;
  };

  // Apply deferred go-to-definition reveal once the target tab is active.
  useEffect(() => {
    const editor = editorRef.current;
    const target = pendingRevealRef.current;
    if (!editor || !target || target.path !== activePath) return;
    const timer = setTimeout(() => revealPending(editor), 80);
    return () => clearTimeout(timer);
  }, [activePath, activeTab?.content]);

  useEffect(
    () => () => {
      completionDisposeRef.current?.();
      aiTabDisposeRef.current?.();
      lspDisposeRef.current?.();
      lspDisposeRef.current = null;
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Select a file from the tree to edit
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center border-b border-surface-border bg-surface">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map((tab) => {
            const dirty = tab.content !== tab.savedContent;
            const isActive = tab.path === activePath;
            const hasPending = pendingChanges.some((c) => c.path === tab.path);
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => onActivePathChange(tab.path)}
                className={`flex max-w-[200px] items-center gap-1 border-r border-surface-border px-3 py-2 text-xs ${
                  isActive
                    ? "bg-[#1e1e1e] text-white"
                    : "text-gray-400 hover:bg-surface-card"
                }`}
              >
                <span className="truncate">
                  {dirty ? "● " : ""}
                  {hasPending ? "◆ " : ""}
                  {tab.path.split("/").pop()}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-1 text-gray-500 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 px-2">
          {markerCount > 0 && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs text-amber-400"
              onClick={() => void handleFixWithAi()}
              disabled={fixing}
              loading={fixing}
            >
              Fix {markerCount} error{markerCount === 1 ? "" : "s"} with AI
            </Button>
          )}
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() => setAiEditOpen(true)}
          >
            AI Edit
          </Button>
          <Button
            className="px-2 py-1 text-xs"
            onClick={handleSave}
            disabled={!isDirty || saving}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </div>

      {activePending && (
        <div className="flex items-center justify-between border-b border-primary/40 bg-primary/10 px-3 py-1.5">
          <span className="text-xs text-foreground">
            ◆ AI proposed changes to this file
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInlineDiffOpen((v) => !v)}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {inlineDiffOpen ? "Hide diff" : "View diff"}
            </button>
            <button
              type="button"
              onClick={() => void handleRejectPending()}
              disabled={resolvingPending}
              className="rounded bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => void handleApplyPending()}
              disabled={resolvingPending}
              className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-1 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {activePending && inlineDiffOpen ? (
          <DiffEditor
            original={activePending.previousContent}
            modified={activePending.newContent}
            language={languageForPath(activeTab.path)}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: false,
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        ) : (
          <MonacoEditor
            path={`file:///${activeTab.path}`}
            language={languageForPath(activeTab.path)}
            value={activeTab.content}
            theme="vs-dark"
            onChange={(value) => updateActiveContent(value ?? "")}
            onMount={handleEditorMount}
            keepCurrentModel
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              inlineSuggest: { enabled: true, mode: "subwordSmart" },
            }}
          />
        )}
      </div>

      {inlineEditOpen && activeTab && (
        <InlineEditPopover
          projectId={projectId}
          path={activeTab.path}
          selectedText={selectedText}
          onClose={() => setInlineEditOpen(false)}
          onApplied={handleAiApplied}
        />
      )}

      {aiEditOpen && activeTab && (
        <AiEditModal
          projectId={projectId}
          path={activeTab.path}
          originalContent={activeTab.content}
          onClose={() => setAiEditOpen(false)}
          onApplied={handleAiApplied}
        />
      )}
    </div>
  );
}
