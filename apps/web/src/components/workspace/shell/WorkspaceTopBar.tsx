"use client";

import {
  GitBranch,
  Globe,
  Rocket,
  Share2,
  ChevronDown,
} from "lucide-react";
import { ShadcnButton } from "@/components/ui/shadcn-button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useToast } from "@/hooks/useToast";
import { WorkspaceNotifications } from "@/components/workspace/shell/WorkspaceNotifications";
import type { SseMessage } from "@/hooks/useSSE";
import type { ReactNode } from "react";

interface WorkspaceTopBarProps {
  projectId: string;
  projectName: string;
  projectStatus: string;
  sseEvents?: SseMessage[];
  actions?: ReactNode;
  onDeploy?: () => void;
  onDomains?: () => void;
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  clarifying: "Clarifying",
  building: "Building",
  ready: "Ready",
  failed: "Failed",
};

export function WorkspaceTopBar({
  projectId,
  projectName,
  projectStatus,
  sseEvents = [],
  actions,
  onDeploy,
  onDomains,
}: WorkspaceTopBarProps) {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const contextSlug = activeWorkspace?.slug ?? "personal";

  const shareProject = async () => {
    const url = `${window.location.origin}/projects/${projectId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({
        title: "Couldn't copy link",
        description: url,
        variant: "destructive",
      });
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden shrink-0 text-muted-foreground md:inline">
          {contextSlug}
        </span>
        <span className="hidden text-muted-foreground/50 md:inline">/</span>
        <span className="min-w-0 truncate font-medium">{projectName}</span>
        <span
          className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            projectStatus === "ready"
              ? "bg-success/20 text-success"
              : projectStatus === "building"
                ? "bg-warning/20 text-warning"
                : projectStatus === "failed"
                  ? "bg-destructive/20 text-destructive"
                  : "bg-secondary text-muted-foreground"
          }`}
        >
          {statusLabel[projectStatus] ?? projectStatus}
        </span>
        <button
          type="button"
          className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-smooth hover:bg-secondary"
        >
          <GitBranch className="h-3 w-3" /> main <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <WorkspaceNotifications projectId={projectId} sseEvents={sseEvents} />
        <ShadcnButton
          variant="outline"
          size="sm"
          className="gap-1.5 border-border bg-secondary/60"
          onClick={() => void shareProject()}
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </ShadcnButton>
        <ShadcnButton
          variant="outline"
          size="sm"
          className="gap-1.5 border-border bg-secondary/60"
          onClick={onDomains}
        >
          <Globe className="h-3.5 w-3.5" /> Domains
        </ShadcnButton>
        {actions}
        <ShadcnButton
          size="sm"
          onClick={onDeploy}
          disabled={projectStatus !== "ready"}
          className="gap-1.5 bg-gradient-primary font-medium text-primary-foreground shadow-glow hover:opacity-95 disabled:opacity-50"
        >
          <Rocket className="h-3.5 w-3.5" /> Deploy
        </ShadcnButton>
      </div>
    </header>
  );
}
