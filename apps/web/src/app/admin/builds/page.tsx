"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SimpleBarChart,
  TrendStatCard,
} from "@/components/admin/ui";

export default function AdminBuildsPage() {
  const [analytics, setAnalytics] = useState<Awaited<
    ReturnType<typeof api.getAdminBuildAnalytics>
  >["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminBuildAnalytics();
      setAnalytics(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load build analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!analytics) return null;

  const { summary, buildsPerDay, topErrors } = analytics;
  const last14 = buildsPerDay.slice(-14);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Build Analytics</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendStatCard label="Total Builds" value={summary.totalBuilds} />
        <TrendStatCard label="Success Rate" value={`${summary.successRate}%`} />
        <TrendStatCard label="Failure Rate" value={`${summary.failureRate}%`} />
        <TrendStatCard
          label="Avg Duration"
          value={
            summary.averageBuildDurationMs
              ? `${(summary.averageBuildDurationMs / 1000).toFixed(1)}s`
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Builds per day (14d)</h2>
          <SimpleBarChart
            data={last14.map((d) => ({ date: d.date, total: d.total }))}
            valueKey="total"
            labelKey="date"
          />
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Success vs failure (14d)</h2>
          <SimpleBarChart
            data={last14.map((d) => ({ date: d.date, total: d.success }))}
            valueKey="total"
            labelKey="date"
            color="bg-emerald-600"
          />
          <SimpleBarChart
            data={last14.map((d) => ({ date: d.date, total: d.failed }))}
            valueKey="total"
            labelKey="date"
            color="bg-red-600"
          />
        </div>
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Most common build errors</h2>
        {topErrors.length === 0 ? (
          <EmptyState message="No build errors recorded" />
        ) : (
          <ul className="space-y-2">
            {topErrors.map((e) => (
              <li key={e.code} className="flex justify-between text-sm">
                <span className="font-mono text-red-300">{e.code}</span>
                <span className="text-gray-400">{e.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
