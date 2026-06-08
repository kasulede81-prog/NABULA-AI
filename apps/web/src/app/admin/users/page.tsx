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

interface UserRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  projectsCount: number;
  buildsUsed: number;
  buildsLimit: number;
  status: string;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
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
      const res = await api.getAdminUsersPaginated({ page, search, status, limit: 20 });
      setItems(res.data.items);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load users");
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
      <h1 className="text-lg font-semibold text-white">User Management</h1>
      <div className="flex flex-wrap gap-3">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or email..." />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-white"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Suspended</option>
        </select>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState message="No users found" />}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-card text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Builds</th>
                <th className="px-4 py-3">Projects</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3">
                    <p className="text-white">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-300">{u.plan}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {u.buildsUsed}/{u.buildsLimit}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u.projectsCount}</td>
                  <td className="px-4 py-3">
                    <span className={u.status === "active" ? "text-emerald-400" : "text-red-400"}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Link href={`/admin/users/${u.id}`} className="text-xs text-nebula-400 hover:underline">
                        View
                      </Link>
                      {u.status === "active" ? (
                        <ActionBtn onClick={() => act(() => api.suspendUser(u.id))}>Suspend</ActionBtn>
                      ) : (
                        <ActionBtn onClick={() => act(() => api.reactivateUser(u.id))}>Reactivate</ActionBtn>
                      )}
                      <ActionBtn onClick={() => act(() => api.resetUserBuildLimits(u.id))}>Reset quota</ActionBtn>
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
