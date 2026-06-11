"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  ChatPanel,
  DeployModal,
  FileTree,
  GitHubExportPanel,
  MonacoEditorPanel,
  PreviewPanel,
  type EditorTab,
} from "@/components/workspace/lazy-workspace";
import { ProgressFeed } from "@/components/workspace/ProgressFeed";
import { WorkspaceSidebar } from "@/components/workspace/shell/WorkspaceSidebar";
import { WorkspaceTopBar } from "@/components/workspace/shell/WorkspaceTopBar";
import { WorkspaceMainPanel } from "@/components/workspace/shell/WorkspaceMainPanel";
import { WorkspaceAgentPanel } from "@/components/workspace/shell/WorkspaceAgentPanel";
import type {
  ProjectListItem,
  WorkspaceView,
} from "@/components/workspace/shell/types";
import { SseEvents } from "@nebula/shared";
import { FileSearchPalette } from "@/components/workspace/FileSearchPalette";
import { TerminalPanel } from "@/components/workspace/TerminalPanel";
import {
  ChangesetReviewPanel,
  type ProposedChange,
} from "@/components/workspace/ChangesetReviewPanel";
import { setLastProjectId } from "@/lib/workspace-entry";

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [changesetOpen, setChangesetOpen] = useState(false);
  const [changesetFiles, setChangesetFiles] = useState<ProposedChange[]>([]);
  const { events, connected } = useSSE(projectId);
  const fileRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedEventCount = useRef(0);

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
    setLastProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".monaco-editor")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void api.getChangeset(projectId).then((res) => {
      if (res.pending && res.files.length > 0) {
        setChangesetFiles(res.files);
        setChangesetOpen(true);
      }
    });
  }, [projectId]);

  useEffect(() => {
    setProjectLoading(true);
    api
      .getProject(projectId)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setProjectLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (workspaceLoading) return;
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
  }, [activeWorkspaceId, workspaceLoading]);

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
          const existing = prev.find((t) => t.path === path);
          if (existing) {
            // Refresh clean tabs with server content (agent writes, restore);
            // never clobber unsaved local edits.
            const dirty = existing.content !== existing.savedContent;
            if (dirty || existing.savedContent === file.content) return prev;
            return prev.map((t) =>
              t.path === path
                ? {
                    ...t,
                    content: file.content,
                    savedContent: file.content,
                    version: file.version,
                  }
                : t
            );
          }
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
    // Process every new event — SSE batches often deliver several events
    // per render, and inspecting only the last one drops the rest.
    const newEvents = events.filter((e) => e.seq > processedEventCount.current);
    if (newEvents.length === 0) return;
    processedEventCount.current = newEvents[newEvents.length - 1].seq;

    let changesetCheckNeeded = false;

    for (const event of newEvents) {
      if (event.type === SseEvents.PROJECT_UPDATED) {
        const status = (event.data as { status?: string }).status;
        if (status) handleStatusChange(status);
      }

      if (
        event.type === SseEvents.FILE_CREATED ||
        event.type === SseEvents.FILE_UPDATED
      ) {
        scheduleFileRefresh();
        const path = (event.data as { path?: string }).path;
        if (path) {
          void openFile(path);
        }
      }

      if (event.type === SseEvents.FILE_DELETED) {
        refreshFiles();
        const path = (event.data as { path?: string }).path;
        if (path) {
          setEditorTabs((prev) => prev.filter((t) => t.path !== path));
          if (selectedPath === path) setSelectedPath(null);
        }
      }

      if (event.type === SseEvents.CHANGESET_PROPOSED) {
        const files = (event.data as { files?: ProposedChange[] }).files ?? [];
        if (files.length > 0) {
          setChangesetFiles(files);
          setChangesetOpen(true);
        }
      }

      if (
        event.type === SseEvents.CHANGESET_APPLIED ||
        event.type === SseEvents.CHANGESET_DISCARDED
      ) {
        changesetCheckNeeded = true;
      }
    }

    if (changesetCheckNeeded) {
      // Per-file apply/discard also emits these events — re-check the
      // server instead of assuming the whole changeset is resolved.
      void api.getChangeset(projectId).then((res) => {
        if (res.pending && res.files.length > 0) {
          setChangesetFiles(res.files);
        } else {
          setChangesetOpen(false);
          setChangesetFiles([]);
        }
      });
      refreshFiles();
    }
  }, [
    events,
    scheduleFileRefresh,
    refreshFiles,
    handleStatusChange,
    openFile,
    selectedPath,
    projectId,
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
          sseEvents={events}
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
            onOpenFile={(path) => {
              setView("agent");
              void openFile(path);
            }}
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
                          onOpenFile={(path) => void openFile(path)}
                          pendingChanges={changesetFiles}
                          onPendingResolved={(path) => {
                            setChangesetFiles((prev) =>
                              prev.filter((f) => f.path !== path)
                            );
                            refreshFiles();
                          }}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm text-muted-foreground">
                          Select a file from the tree
                        </div>
                      )}
                    </section>
                  </div>
                }
                terminal={
                  <TerminalPanel projectId={projectId} sseEvents={events} />
                }
              />
            }
          />
        </div>
      </div>

      {deployOpen ? (
        <DeployModal
          open={deployOpen}
          onClose={() => setDeployOpen(false)}
          projectId={projectId}
          projectName={project?.name ?? "Project"}
        />
      ) : null}

      <FileSearchPalette
        projectId={projectId}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenFile={(path) => {
          setView("agent");
          void openFile(path);
        }}
      />

      {changesetOpen && changesetFiles.length > 0 ? (
        <ChangesetReviewPanel
          projectId={projectId}
          files={changesetFiles}
          onClose={() => setChangesetOpen(false)}
          onApplied={() => {
            refreshFiles();
            setChangesetFiles([]);
          }}
        />
      ) : null}
    </div>
  );
}
