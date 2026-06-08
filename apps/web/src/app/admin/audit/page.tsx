"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBar,
} from "@/components/admin/ui";

interface AuditRow {
  id: string;
  action: string;
  adminEmail: string;
  targetType: string | null;
  targetLabel: string | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAudit({ page, search, limit: 25 });
      setItems(res.data.items);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Audit Logs</h1>
      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search admin, target..." />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState message="No audit entries" />}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-card text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Target</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-nebula-400">{row.action}</td>
                  <td className="px-4 py-3 text-gray-300">{row.adminEmail}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {row.targetLabel ?? row.targetType ?? "—"}
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
