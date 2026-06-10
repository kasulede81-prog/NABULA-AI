"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FileTree } from "@/components/workspace/FileTree";
import {
  MonacoEditorPanel,
  type EditorTab,
} from "@/components/workspace/MonacoEditorPanel";
import { PreviewPanel } from "@/components/workspace/PreviewPanel";
import { ProgressFeed } from "@/components/workspace/ProgressFeed";
import { GitHubExportPanel } from "@/components/workspace/GitHubExportPanel";
import { DeployModal } from "@/components/workspace/DeployModal";
import { WorkspaceSidebar } from "@/components/workspace/shell/WorkspaceSidebar";
import { WorkspaceTopBar } from "@/components/workspace/shell/WorkspaceTopBar";
import { WorkspaceMainPanel } from "@/components/workspace/shell/WorkspaceMainPanel";
import { WorkspaceAgentPanel } from "@/components/workspace/shell/WorkspaceAgentPanel";
import type {
  ProjectListItem,
  WorkspaceView,
} from "@/components/workspace/shell/types";
import { SseEvents } from "@nebula/shared";

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { activeWorkspaceId } = useWorkspace();
  const [view, setView] = useState<WorkspaceView>("agent");
  const [deployOpen, setDeployOpen] = useState(false);
  const [project, setProject] = useState<{
    name: string;
    status: string;
    prompt: string;
    workspaceId: string | null;
  } | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const { events, connected } = useSSE(projectId);
  const fileRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshFiles = useCallback(() => {
    setFileRefreshKey((k) => k + 1);
  }, []);

  const scheduleFileRefresh = useCallback(() => {
    if (fileRefreshTimer.current) {
      clearTimeout(fileRefreshTimer.current);
    }
    fileRefreshTimer.current = setTimeout(() => {
      refreshFiles();
      fileRefreshTimer.current = null;
    }, 500);
  }, [refreshFiles]);

  useEffect(() => {
    setProjectLoading(true);
    api
      .getProject(projectId)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setProjectLoading(false));
  }, [projectId]);

  useEffect(() => {
    setProjectsLoading(true);
    api
      .listProjects(
        activeWorkspaceId
          ? { workspaceId: activeWorkspaceId }
          : { scope: "personal" }
      )
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, [activeWorkspaceId]);

  useEffect(() => {
    return () => {
      if (fileRefreshTimer.current) {
        clearTimeout(fileRefreshTimer.current);
      }
    };
  }, []);

  const projectStatus = project?.status ?? "draft";

  const handleStatusChange = useCallback((status: string) => {
    setProject((prev) =>
      prev
        ? { ...prev, status }
        : { name: "", status, prompt: "", workspaceId: null }
    );
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
      last.type === SseEvents.FILE_UPDATED
    ) {
      scheduleFileRefresh();
      const path = (last.data as { path?: string }).path;
      if (path) {
        void openFile(path);
      }
    }

    if (last.type === SseEvents.FILE_DELETED) {
      refreshFiles();
      const path = (last.data as { path?: string }).path;
      if (path) {
        setEditorTabs((prev) => prev.filter((t) => t.path !== path));
        if (selectedPath === path) setSelectedPath(null);
      }
    }
  }, [
    events,
    scheduleFileRefresh,
    refreshFiles,
    handleStatusChange,
    openFile,
    selectedPath,
  ]);

  const projectName = projectLoading && !project ? "Loading…" : (project?.name ?? "Project");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <WorkspaceSidebar
        view={view}
        onView={setView}
        projectId={projectId}
        projects={projects}
        projectsLoading={projectsLoading}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceTopBar
          projectId={projectId}
          projectName={projectName}
          projectStatus={projectStatus}
          onDeploy={() => setDeployOpen(true)}
          onDomains={() => setView("domains")}
          actions={
            <GitHubExportPanel
              projectId={projectId}
              projectStatus={projectStatus}
              sseEvents={events}
            />
          }
        />

        <div className="flex min-h-0 flex-1">
          {view === "agent" && (
            <div className="w-[42%] min-w-[380px] max-w-[560px] shrink-0 border-r border-border">
              <div className="flex h-full flex-col">
                <ChatPanel
                  projectId={projectId}
                  projectStatus={projectStatus}
                  sseEvents={events}
                  onStatusChange={handleStatusChange}
                />
                <div className="max-h-[180px] shrink-0 border-t border-border">
                  <ProgressFeed events={events} connected={connected} />
                </div>
              </div>
            </div>
          )}

          <WorkspaceMainPanel
            view={view}
            projectId={projectId}
            workspaceId={project?.workspaceId ?? null}
            agent={
              <WorkspaceAgentPanel
                preview={
                  <PreviewPanel
                    projectId={projectId}
                    projectStatus={projectStatus}
                    sseEvents={events}
                    sseConnected={connected}
                  />
                }
                code={
                  <div className="grid h-full grid-cols-[220px_1fr] overflow-hidden">
                    <aside className="overflow-hidden border-r border-border">
                      <FileTree
                        projectId={projectId}
                        selectedPath={selectedPath}
                        onSelect={(path) => void openFile(path)}
                        onRefresh={refreshFiles}
                        refreshKey={fileRefreshKey}
                      />
                    </aside>
                    <section className="overflow-hidden">
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
                        <div className="grid h-full place-items-center text-sm text-muted-foreground">
                          Select a file from the tree
                        </div>
                      )}
                    </section>
                  </div>
                }
              />
            }
          />
        </div>
      </div>

      <DeployModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        projectId={projectId}
        projectName={project?.name ?? "Project"}
      />
    </div>
  );
}
