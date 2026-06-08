"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ActionBtn,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/admin/ui";

interface PreviewRow {
  id: string;
  projectId: string;
  projectName: string;
  userEmail: string;
  status: string;
  phase: string;
  previewUrl: string | null;
  sandboxAgeMinutes: number | null;
  errorCode: string | null;
}

export default function AdminPreviewsPage() {
  const [items, setItems] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminPreviews();
      setItems(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load previews");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const running = items.filter((p) => p.status === "starting" || p.status === "ready");
  const failed = items.filter((p) => p.status === "error");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Preview Monitoring</h1>
      <div className="flex gap-4 text-sm text-gray-400">
        <span>Running: <strong className="text-white">{running.length}</strong></span>
        <span>Failed: <strong className="text-red-400">{failed.length}</strong></span>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState message="No previews" />}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-card text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Phase</th>
                <th className="px-4 py-3">Sandbox age</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3">
                    <p className="text-white">{p.projectName}</p>
                    <p className="text-xs text-gray-500">{p.userEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.status}</td>
                  <td className="px-4 py-3 text-gray-400">{p.phase}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {p.sandboxAgeMinutes !== null ? `${p.sandboxAgeMinutes}m` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.previewUrl ? (
                      <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-nebula-400 hover:underline">
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">{p.errorCode ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <ActionBtn onClick={() => act(() => api.restartAdminPreview(p.projectId))}>Restart</ActionBtn>
                      <ActionBtn onClick={() => act(() => api.stopAdminPreview(p.projectId))}>Stop</ActionBtn>
                      <ActionBtn variant="danger" onClick={() => act(() => api.deleteAdminPreview(p.projectId))}>Delete</ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
