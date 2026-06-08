"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorState, HealthCard, LoadingState } from "@/components/admin/ui";

export default function AdminSystemPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAdminSystem>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminSystem();
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load system health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">System Health</h1>
          <p className="text-sm text-gray-500">
            Last check: {new Date(data.checkedAt).toLocaleString()} · Overall:{" "}
            <span className="capitalize text-white">{data.overall}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-nebula-400 hover:underline"
        >
          Refresh
        </button>
      </div>

      {data.backup && (
        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-2 text-sm font-medium text-white">Backup & connectivity</h2>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between">
              <dt className="text-gray-500">Database reachable</dt>
              <dd className={data.backup.databaseReachable ? "text-green-400" : "text-red-400"}>
                {data.backup.databaseReachable ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last metric snapshot</dt>
              <dd className="text-gray-300">
                {data.backup.lastMetricCheck
                  ? new Date(data.backup.lastMetricCheck).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {data.rateLimits && (
        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-2 text-sm font-medium text-white">Rate limits (per minute)</h2>
          <dl className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data.rateLimits).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="capitalize text-gray-500">{key}</dt>
                <dd className="text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.services.map((s) => (
          <HealthCard
            key={s.service}
            service={s.service}
            status={s.status}
            latencyMs={s.latencyMs}
            lastCheck={s.lastCheck}
          />
        ))}
      </div>
    </div>
  );
}
