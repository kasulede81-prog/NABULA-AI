"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { languageForPath } from "@/lib/monaco-language";
import { AiEditModal } from "./AiEditModal";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-500">
      Loading editor...
    </div>
  ),
});

export interface EditorTab {
  path: string;
  content: string;
  savedContent: string;
  version: number | null;
}

interface MonacoEditorPanelProps {
  projectId: string;
  tabs: EditorTab[];
  activePath: string | null;
  onTabsChange: (tabs: EditorTab[]) => void;
  onActivePathChange: (path: string | null) => void;
  onFileSaved: () => void;
}

export function MonacoEditorPanel({
  projectId,
  tabs,
  activePath,
  onTabsChange,
  onActivePathChange,
  onFileSaved,
}: MonacoEditorPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEditOpen, setAiEditOpen] = useState(false);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  const isDirty =
    activeTab != null && activeTab.content !== activeTab.savedContent;

  const updateActiveContent = useCallback(
    (content: string) => {
      if (!activePath) return;
      onTabsChange(
        tabs.map((t) => (t.path === activePath ? { ...t, content } : t))
      );
    },
    [activePath, onTabsChange, tabs]
  );

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
    onFileSaved();
    setAiEditOpen(false);
  };

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
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center border-b border-surface-border bg-surface">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map((tab) => {
            const dirty = tab.content !== tab.savedContent;
            const isActive = tab.path === activePath;
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

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-1 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MonacoEditor
          key={activeTab.path}
          language={languageForPath(activeTab.path)}
          value={activeTab.content}
          theme="vs-dark"
          onChange={(value) => updateActiveContent(value ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>

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
