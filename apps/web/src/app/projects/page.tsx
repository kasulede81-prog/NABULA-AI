"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface Project {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  status: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listProjects()
      .then((res) => setProjects(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <Link href="/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-12 text-center">
          <p className="mb-4 text-gray-400">No projects yet</p>
          <Link href="/projects/new">
            <Button>Create your first project</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block rounded-xl border border-surface-border bg-surface-card p-5 transition-colors hover:border-nebula-600"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">{project.name}</h2>
                <span className="rounded-full bg-surface-border px-2 py-0.5 text-xs text-gray-400">
                  {project.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                {project.prompt}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
