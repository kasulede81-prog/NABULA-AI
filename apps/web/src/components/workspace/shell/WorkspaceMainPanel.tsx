"use client";

import type { ReactNode } from "react";
import { EnvVarsTab } from "@/components/workspace/tabs/EnvVarsTab";
import { DomainsTab } from "@/components/workspace/tabs/DomainsTab";
import { DatabaseTab } from "@/components/workspace/tabs/DatabaseTab";
import { LogsTab } from "@/components/workspace/tabs/LogsTab";
import { DeploymentsTab } from "@/components/workspace/tabs/DeploymentsTab";
import { TeamTab } from "@/components/workspace/tabs/TeamTab";
import type { WorkspaceView } from "./types";

interface WorkspaceMainPanelProps {
  view: WorkspaceView;
  projectId: string;
  workspaceId: string | null;
  agent: ReactNode;
}

export function WorkspaceMainPanel({
  view,
  projectId,
  workspaceId,
  agent,
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

  return (
    <div className="h-full min-w-0 flex-1 overflow-hidden">
      <TeamTab projectId={projectId} workspaceId={workspaceId} />
    </div>
  );
}
