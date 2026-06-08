"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/admin/ui";

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAdminUser>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminUser(userId);
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-xs text-nebula-400 hover:underline">
        ← Back to users
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-white">{data.name}</h1>
        <p className="text-sm text-gray-500">{data.email}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <p className="text-xs text-gray-500">Plan</p>
          <p className="mt-1 capitalize text-white">{data.plan}</p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <p className="text-xs text-gray-500">Build usage</p>
          <p className="mt-1 text-white">
            {data.buildsUsed}/{data.buildsLimit}
          </p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <p className="text-xs text-gray-500">Projects</p>
          <p className="mt-1 text-white">{data.projectsCount}</p>
        </div>
      </div>

      <section className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Activity</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between">
            <dt className="text-gray-500">Last login</dt>
            <dd className="text-white">
              {data.activity.lastLoginAt
                ? new Date(data.activity.lastLoginAt).toLocaleString()
                : "Never"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Member since</dt>
            <dd className="text-white">
              {data.activity.memberSince
                ? new Date(data.activity.memberSince).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Projects created</dt>
            <dd className="text-white">{data.activity.projectsCreated}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Previews launched</dt>
            <dd className="text-white">{data.activity.previewsLaunched}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">GitHub exports</dt>
            <dd className="text-white">{data.activity.exportsPerformed}</dd>
          </div>
        </dl>
      </section>

      <div>
        <h2 className="mb-2 text-sm font-medium text-white">Recent Projects</h2>
        <div className="space-y-2">
          {data.projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between rounded border border-surface-border bg-surface-card px-4 py-3 hover:border-nebula-600"
            >
              <span className="text-sm text-white">{p.name}</span>
              <span className="text-xs text-gray-500">{p.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
