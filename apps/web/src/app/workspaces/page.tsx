"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function WorkspacesPage() {
  const { workspaces, refreshWorkspaces } = useWorkspace();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await refreshWorkspaces();
    setLoading(false);
  }, [refreshWorkspaces]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workspaces</h1>
          <p className="mt-1 text-sm text-gray-500">
            Collaborate with your team on shared projects
          </p>
        </div>
        <Link href="/workspaces/new">
          <Button>Create Workspace</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading workspaces...</p>
      ) : workspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-12 text-center">
          <p className="mb-4 text-gray-400">No workspaces yet</p>
          <Link href="/workspaces/new">
            <Button>Create your first workspace</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspaces/${ws.id}`}
              className="block rounded-xl border border-surface-border bg-surface-card p-5 transition-colors hover:border-nebula-600"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">{ws.name}</h2>
                <span className="rounded-full bg-surface-border px-2 py-0.5 text-xs capitalize text-gray-400">
                  {ws.role}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {ws.membersCount} members · {ws.projectsCount} projects · {ws.plan} plan
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
