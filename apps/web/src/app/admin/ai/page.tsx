"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  SimpleBarChart,
  TrendStatCard,
} from "@/components/admin/ui";

export default function AdminAiPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAdminAiUsage>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAiUsage();
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load AI usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const last14 = data.dailyTokenUsage.slice(-14);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">AI Usage Monitoring</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendStatCard label="Current Provider" value={data.currentProvider} />
        <TrendStatCard label="Total Requests (30d)" value={data.totalRequests} />
        <TrendStatCard
          label="Tokens In / Out"
          value={`${(data.totalTokensInput / 1000).toFixed(1)}k / ${(data.totalTokensOutput / 1000).toFixed(1)}k`}
        />
        <TrendStatCard label="Est. Cost" value={`$${data.estimatedCostUsd.toFixed(4)}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TrendStatCard
          label="DeepSeek"
          value={`${data.deepseek.requests} req`}
          suffix={`${data.deepseek.failed} failed`}
        />
        <TrendStatCard
          label="Anthropic"
          value={`${data.anthropic.requests} req`}
          suffix={`${data.anthropic.failed} failed`}
        />
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Daily token usage (14d)</h2>
        <SimpleBarChart
          data={last14.map((d) => ({
            date: d.date,
            total: d.tokensInput + d.tokensOutput,
          }))}
          valueKey="total"
          labelKey="date"
        />
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Provider breakdown</h2>
        <div className="space-y-2">
          {data.providerBreakdown.map((p) => (
            <div key={p.provider} className="flex justify-between text-sm">
              <span className="capitalize text-white">{p.provider}</span>
              <span className="text-gray-400">
                {p.requests} req · {(p.tokensIn / 1000).toFixed(1)}k in · ${p.estimatedCostUsd.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
