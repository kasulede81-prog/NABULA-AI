"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  ActionBtn,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBar,
} from "@/components/admin/ui";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  filesCount: number;
  buildsCount: number;
  previewStatus: string | null;
  createdAt: string;
}

export default function AdminProjectsPage() {
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminProjects({ page, search, status, limit: 20 });
      setItems(res.data.items);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (err) {
      const e = err as { error?: { message?: string } };
      alert(e.error?.message ?? "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Project Management</h1>
      <div className="flex flex-wrap gap-3">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search project or owner..." />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-white"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="building">Building</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState message="No projects found" />}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-card text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Files</th>
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3 text-white">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.ownerEmail}</td>
                  <td className="px-4 py-3 text-gray-300">{p.status}</td>
                  <td className="px-4 py-3 text-gray-300">{p.filesCount}</td>
                  <td className="px-4 py-3 text-gray-300">{p.previewStatus ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Link href={`/projects/${p.id}`} className="text-xs text-nebula-400 hover:underline">Open</Link>
                      <ActionBtn onClick={() => act(() => api.retryAdminBuild(p.id))}>Retry build</ActionBtn>
                      <ActionBtn onClick={() => act(() => api.retryAdminPreview(p.id))}>Retry preview</ActionBtn>
                      <ActionBtn onClick={() => act(() => api.retryAdminGithubSync(p.id))}>Retry GitHub sync</ActionBtn>
                      <ActionBtn variant="danger" onClick={() => {
                        if (confirm(`Delete project "${p.name}"?`)) {
                          void act(() => api.deleteAdminProject(p.id));
                        }
                      }}>Delete</ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
