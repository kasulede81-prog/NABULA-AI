"use client";

import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FileTree } from "@/components/workspace/FileTree";
import {
  MonacoEditorPanel,
  type EditorTab,
} from "@/components/workspace/MonacoEditorPanel";
import { PreviewPanel } from "@/components/workspace/PreviewPanel";
import { ProgressFeed } from "@/components/workspace/ProgressFeed";
import { GitHubExportPanel } from "@/components/workspace/GitHubExportPanel";
import { SseEvents } from "@nebula/shared";

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<{
    name: string;
    status: string;
    prompt: string;
  } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const { events, connected } = useSSE(projectId);

  const refreshFiles = useCallback(() => {
    setFileRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    api.getProject(projectId).then(setProject);
  }, [projectId]);

  const handleStatusChange = useCallback((status: string) => {
    setProject((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      try {
        const file = await api.readFile(projectId, path);
        setEditorTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [
            ...prev,
            {
              path,
              content: file.content,
              savedContent: file.content,
              version: file.version,
            },
          ];
        });
      } catch {
        /* ignore */
      }
    },
    [projectId]
  );

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    if (last.type === SseEvents.PROJECT_UPDATED) {
      const status = (last.data as { status?: string }).status;
      if (status) handleStatusChange(status);
    }

    if (
      last.type === SseEvents.FILE_CREATED ||
      last.type === SseEvents.FILE_UPDATED ||
      last.type === SseEvents.FILE_DELETED
    ) {
      refreshFiles();
      const path = (last.data as { path?: string }).path;
      if (path && last.type === SseEvents.FILE_DELETED) {
        setEditorTabs((prev) => prev.filter((t) => t.path !== path));
        if (selectedPath === path) setSelectedPath(null);
      }
      if (path && last.type !== SseEvents.FILE_DELETED) {
        void openFile(path);
      }
    }
  }, [events, refreshFiles, handleStatusChange, openFile, selectedPath]);

  if (!project) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-gray-500">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-6 py-3">
        <div>
          <h1 className="font-semibold text-white">{project.name}</h1>
          <p className="text-xs text-gray-500">
            Status:{" "}
            <span
              className={
                project.status === "building"
                  ? "text-yellow-400 animate-pulse"
                  : project.status === "ready"
                    ? "text-green-400"
                    : project.status === "failed"
                      ? "text-red-400"
                      : "text-nebula-500"
              }
            >
              {project.status}
            </span>
          </p>
        </div>
        <GitHubExportPanel
          projectId={projectId}
          projectStatus={project.status}
          sseEvents={events}
        />
      </div>

      <div className="grid flex-1 grid-cols-[240px_1fr_360px] overflow-hidden">
        <aside className="border-r border-surface-border overflow-hidden flex flex-col">
          <FileTree
            projectId={projectId}
            selectedPath={selectedPath}
            onSelect={(path) => void openFile(path)}
            onRefresh={refreshFiles}
            refreshKey={fileRefreshKey}
          />
          <ProgressFeed events={events} connected={connected} />
        </aside>

        <section className="overflow-hidden border-r border-surface-border">
          {selectedPath ? (
            <MonacoEditorPanel
              projectId={projectId}
              tabs={editorTabs}
              activePath={selectedPath}
              onTabsChange={setEditorTabs}
              onActivePathChange={setSelectedPath}
              onFileSaved={refreshFiles}
            />
          ) : (
            <PreviewPanel
              projectId={projectId}
              projectStatus={project.status}
              sseEvents={events}
            />
          )}
        </section>

        <aside className="overflow-hidden">
          <ChatPanel
            projectId={projectId}
            projectStatus={project.status}
            sseEvents={events}
            onStatusChange={handleStatusChange}
          />
        </aside>
      </div>
    </div>
  );
}
