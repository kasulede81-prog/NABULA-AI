"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  ErrorState,
  LoadingState,
  Pagination,
} from "@/components/admin/ui";

export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<string>("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<
    Awaited<ReturnType<typeof api.getAdminFeedback>>["data"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminFeedback({
        page,
        limit: 20,
        status: status === "all" ? undefined : status,
      });
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFeedbackStatus = async (id: string, next: string) => {
    setBusyId(id);
    try {
      await api.updateAdminFeedbackStatus(id, next);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">User Feedback</h1>
          <p className="text-sm text-gray-500">{data?.total ?? 0} submissions</p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded border border-surface-border bg-surface px-2 py-1.5 text-xs text-white"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {!data || data.items.length === 0 ? (
        <p className="text-sm text-gray-500">No feedback yet</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-surface-border bg-surface-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">
                    {f.userName}{" "}
                    <span className="font-normal text-gray-500">({f.userEmail})</span>
                  </p>
                  <p className="mt-1 text-xs capitalize text-nebula-400">{f.category}</p>
                </div>
                <span className="rounded bg-surface px-2 py-0.5 text-xs capitalize text-gray-400">
                  {f.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-300">{f.message}</p>
              <p className="mt-2 text-xs text-gray-600">
                {new Date(f.createdAt).toLocaleString()}
              </p>
              {f.status === "open" && (
                <div className="mt-3 flex gap-2">
                  <Button
                    className="px-2 py-1 text-xs"
                    loading={busyId === f.id}
                    onClick={() => void setFeedbackStatus(f.id, "reviewed")}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => void setFeedbackStatus(f.id, "closed")}
                  >
                    Close
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && (
        <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
      )}
    </div>
  );
}
