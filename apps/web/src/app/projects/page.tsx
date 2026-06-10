"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  status: string;
  visibility: string;
  workspaceId: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  ready: "bg-success/15 text-success",
  building: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
  clarifying: "bg-primary/15 text-primary",
  draft: "bg-muted text-muted-foreground",
};

export default function ProjectsPage() {
  const { activeWorkspaceId, activeWorkspace, loading: workspaceLoading } =
    useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjects(
        activeWorkspaceId
          ? { workspaceId: activeWorkspaceId }
          : { scope: "personal" }
      );
      setProjects(res.data);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaceLoading) return;
    void load();
  }, [load, workspaceLoading]);

  const contextLabel = activeWorkspace ? activeWorkspace.name : "Personal";
  const newProjectHref = activeWorkspaceId
    ? `/projects/new?workspaceId=${activeWorkspaceId}`
    : "/projects/new";

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contextLabel} workspace · open a project to enter the builder
          </p>
        </div>
        <Link
          href={newProjectHref}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-smooth hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New project
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border bg-card/50"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-xl border border-dashed border-border px-8 py-16 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <p className="mb-2 font-medium">No projects yet</p>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Create your first project in {contextLabel} to open the full agent
            workspace with preview, code, and deploy tools.
          </p>
          <Link
            href={newProjectHref}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create a project
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group block rounded-xl border border-border bg-card/60 p-5 shadow-card transition-smooth hover:border-primary/40 hover:bg-card"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold group-hover:text-primary">
                  {project.name}
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs capitalize",
                    statusColors[project.status] ?? statusColors.draft
                  )}
                >
                  {project.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {project.prompt}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
