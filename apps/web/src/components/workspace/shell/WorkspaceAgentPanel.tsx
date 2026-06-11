"use client";

import { useState, type ReactNode } from "react";
import { Code2, Eye, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentTab = "preview" | "code" | "terminal";

interface WorkspaceAgentPanelProps {
  preview: ReactNode;
  code: ReactNode;
  terminal: ReactNode;
  defaultTab?: AgentTab;
}

export function WorkspaceAgentPanel({
  preview,
  code,
  terminal,
  defaultTab = "preview",
}: WorkspaceAgentPanelProps) {
  const [tab, setTab] = useState<AgentTab>(defaultTab);

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5">
          <TabBtn
            active={tab === "preview"}
            onClick={() => setTab("preview")}
            icon={Eye}
            label="Preview"
          />
          <TabBtn
            active={tab === "code"}
            onClick={() => setTab("code")}
            icon={Code2}
            label="Code"
          />
          <TabBtn
            active={tab === "terminal"}
            onClick={() => setTab("terminal")}
            icon={Terminal}
            label="Terminal"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" ? preview : tab === "code" ? code : terminal}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
        active
          ? "bg-background text-foreground shadow-card"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
