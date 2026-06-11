"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { WorkspaceView } from "./types";

const tabLoading = (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    Loading…
  </div>
);

const EnvVarsTab = dynamic(
  () => import("../tabs/EnvVarsTab").then((m) => m.EnvVarsTab),
  { ssr: false, loading: () => tabLoading }
);
const DomainsTab = dynamic(
  () => import("../tabs/DomainsTab").then((m) => m.DomainsTab),
  { ssr: false, loading: () => tabLoading }
);
const DatabaseTab = dynamic(
  () => import("../tabs/DatabaseTab").then((m) => m.DatabaseTab),
  { ssr: false, loading: () => tabLoading }
);
const LogsTab = dynamic(
  () => import("../tabs/LogsTab").then((m) => m.LogsTab),
  { ssr: false, loading: () => tabLoading }
);
const DeploymentsTab = dynamic(
  () => import("../tabs/DeploymentsTab").then((m) => m.DeploymentsTab),
  { ssr: false, loading: () => tabLoading }
);
const TeamTab = dynamic(
  () => import("../tabs/TeamTab").then((m) => m.TeamTab),
  { ssr: false, loading: () => tabLoading }
);
const RulesTab = dynamic(
  () => import("../tabs/RulesTab").then((m) => m.RulesTab),
  { ssr: false, loading: () => tabLoading }
);
const AgentRunsTab = dynamic(
  () => import("../tabs/AgentRunsTab").then((m) => m.AgentRunsTab),
  { ssr: false, loading: () => tabLoading }
);
const HistoryTab = dynamic(
  () => import("../tabs/HistoryTab").then((m) => m.HistoryTab),
  { ssr: false, loading: () => tabLoading }
);
const McpTab = dynamic(
  () => import("../tabs/McpTab").then((m) => m.McpTab),
  { ssr: false, loading: () => tabLoading }
);

interface WorkspaceMainPanelProps {
  view: WorkspaceView;
  projectId: string;
  workspaceId: string | null;
  agent: ReactNode;
  onOpenFile?: (path: string) => void;
}

export function WorkspaceMainPanel({
  view,
  projectId,
  workspaceId,
  agent,
  onOpenFile,
}: WorkspaceMainPanelProps) {
  if (view === "agent") {
    return <div className="h-full min-w-0 flex-1 overflow-hidden">{agent}</div>;
  }

  if (view === "database") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <DatabaseTab projectId={projectId} />
      </div>
    );
  }

  if (view === "deployments") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <DeploymentsTab projectId={projectId} />
      </div>
    );
  }

  if (view === "domains") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <DomainsTab projectId={projectId} />
      </div>
    );
  }

  if (view === "env") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <EnvVarsTab projectId={projectId} />
      </div>
    );
  }

  if (view === "logs") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <LogsTab projectId={projectId} />
      </div>
    );
  }

  if (view === "rules") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <RulesTab projectId={projectId} />
      </div>
    );
  }

  if (view === "agents") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <AgentRunsTab projectId={projectId} />
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <HistoryTab projectId={projectId} onOpenFile={onOpenFile} />
      </div>
    );
  }

  if (view === "mcp") {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <McpTab projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 flex-1 overflow-hidden">
      <TeamTab projectId={projectId} workspaceId={workspaceId} />
    </div>
  );
}
