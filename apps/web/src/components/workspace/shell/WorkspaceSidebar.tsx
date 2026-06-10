"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Plus,
  Cloud,
  Database,
  KeyRound,
  Activity,
  Users,
  Globe,
  ChevronsLeft,
  ChevronsRight,
  Search,
  LogOut,
  ChevronDown,
  Check,
  Building2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/BrandMark";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import type { ProjectListItem, WorkspaceView } from "./types";

const nav: {
  icon: typeof Sparkles;
  label: string;
  view: WorkspaceView;
}[] = [
  { icon: Sparkles, label: "Agent", view: "agent" },
  { icon: Database, label: "Database", view: "database" },
  { icon: Cloud, label: "Deployments", view: "deployments" },
  { icon: Globe, label: "Domains", view: "domains" },
  { icon: KeyRound, label: "Env Vars", view: "env" },
  { icon: Activity, label: "Logs", view: "logs" },
  { icon: Users, label: "Team", view: "team" },
];

interface WorkspaceSidebarProps {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  projectId: string;
  projects: ProjectListItem[];
  projectsLoading?: boolean;
}

export function WorkspaceSidebar({
  view,
  onView,
  projectId,
  projects,
  projectsLoading,
}: WorkspaceSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { workspaces, activeWorkspaceId, activeWorkspace, setActiveWorkspaceId } =
    useWorkspace();
  const { user, logout } = useAuth();

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const newProjectHref = activeWorkspaceId
    ? `/projects/new?workspaceId=${activeWorkspaceId}`
    : "/projects/new";

  const contextLabel = activeWorkspace?.name ?? "Personal";
  const contextRole = activeWorkspace?.role ?? "owner";

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-border bg-sidebar transition-smooth",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      <div className="flex h-14 items-center border-b border-border px-3">
        <Link href="/projects" className="flex shrink-0 items-center gap-2">
          <BrandMark compact />
          {!collapsed && <BrandMark />}
        </Link>
      </div>

      {!collapsed && (
        <div className="relative px-3 pt-3">
          <button
            type="button"
            onClick={() => setTeamOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-left transition-smooth hover:bg-secondary"
          >
            {activeWorkspace ? (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{contextLabel}</div>
              <div className="text-[10px] capitalize text-muted-foreground">
                {contextRole}
              </div>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {teamOpen && (
            <div className="absolute left-3 right-3 top-full z-20 mt-1 animate-fade-in-up rounded-lg border border-border bg-popover py-1 shadow-elegant">
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspaceId(null);
                  setTeamOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary"
              >
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 truncate text-left">Personal</span>
                {!activeWorkspaceId && (
                  <Check className="h-3 w-3 text-primary" />
                )}
              </button>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setTeamOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary"
                >
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">{ws.name}</span>
                  {ws.id === activeWorkspaceId && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-3">
        <Link
          href={newProjectHref}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-smooth bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95",
            collapsed && "justify-center px-2"
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {!collapsed && <span>New Project</span>}
        </Link>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-full rounded-md border border-border bg-input/60 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
      )}

      <nav className="mt-1 space-y-0.5 px-2">
        {nav.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onView(item.view)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-smooth",
              view === item.view
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && view === item.view && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary pulse-glow" />
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="flex flex-1 flex-col overflow-hidden px-3 pt-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Projects
            </span>
            <span className="text-[10px] text-muted-foreground">
              {filtered.length}
            </span>
          </div>
          <div className="scrollbar-thin space-y-0.5 overflow-y-auto pr-1">
            {projectsLoading && (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                Loading…
              </p>
            )}
            {!projectsLoading && filtered.length === 0 && (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                No projects yet. Create one →
              </p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  router.push(`/projects/${p.id}`);
                  onView("agent");
                }}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-smooth hover:bg-sidebar-accent/60 hover:text-foreground",
                  p.id === projectId
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    p.status === "ready"
                      ? "bg-success"
                      : p.status === "building"
                        ? "bg-warning"
                        : p.status === "failed"
                          ? "bg-destructive"
                          : "bg-muted-foreground"
                  )}
                />
                <span className="truncate font-mono text-xs">
                  {p.slug || p.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 border-t border-border p-3">
        {!collapsed && user && (
          <div className="mb-1 flex items-center gap-2 px-1.5 py-1">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-accent text-[10px] font-semibold text-accent-foreground">
              {(user.name?.[0] || user.email?.[0] || "U").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium">
                {user.name || user.email}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground transition-smooth hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-sidebar-accent/60"
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
