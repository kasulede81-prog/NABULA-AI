"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface BuildAnalytics {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  successRate: number;
  averageBuildDurationMs: number | null;
  averageTokensInput: number;
  averageTokensOutput: number;
  averageEstimatedCostUsd: number | null;
  topFailureCodes: Array<{ code: string; count: number }>;
  topFailurePhases: Array<{ phase: string; count: number }>;
  buildsByProvider: Array<{
    provider: string;
    total: number;
    successful: number;
    failed: number;
  }>;
  workspaceMetrics: {
    filesOpened: number;
    filesSaved: number;
    aiEditsRequested: number;
    aiEditsApplied: number;
  };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<BuildAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getBuildAnalytics()
      .then((res) => setData(res.data))
      .catch((err: { error?: { message?: string } }) => {
        setError(err.error?.message ?? "Failed to load analytics");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading analytics...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error ?? "No data"}</p>
        <Link href="/projects" className="text-sm text-nebula-400 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const durationSec =
    data.averageBuildDurationMs != null
      ? (data.averageBuildDurationMs / 1000).toFixed(1)
      : "n/a";

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Build Analytics</h1>
            <p className="text-sm text-gray-500">Admin — builder runs & workspace metrics</p>
          </div>
          <Link href="/projects" className="text-sm text-nebula-400 hover:underline">
            Projects
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total builds" value={String(data.totalBuilds)} />
          <StatCard label="Successful" value={String(data.successfulBuilds)} />
          <StatCard label="Failed" value={String(data.failedBuilds)} />
          <StatCard
            label="Success rate"
            value={`${(data.successRate * 100).toFixed(1)}%`}
          />
          <StatCard label="Avg duration" value={`${durationSec}s`} />
          <StatCard
            label="Avg tokens (in/out)"
            value={`${Math.round(data.averageTokensInput)} / ${Math.round(data.averageTokensOutput)}`}
          />
          <StatCard
            label="Avg est. cost"
            value={
              data.averageEstimatedCostUsd != null
                ? `$${data.averageEstimatedCostUsd.toFixed(4)}`
                : "n/a"
            }
          />
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-white">Builds by provider</h2>
          <div className="overflow-hidden rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-card text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2">Provider</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">OK</th>
                  <th className="px-4 py-2">Failed</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {data.buildsByProvider.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-gray-500">
                      No builder runs yet
                    </td>
                  </tr>
                ) : (
                  data.buildsByProvider.map((row) => (
                    <tr key={row.provider} className="border-t border-surface-border">
                      <td className="px-4 py-2">{row.provider}</td>
                      <td className="px-4 py-2">{row.total}</td>
                      <td className="px-4 py-2 text-green-400">{row.successful}</td>
                      <td className="px-4 py-2 text-red-400">{row.failed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-lg font-medium text-white">Top failure codes</h2>
            <ul className="rounded-lg border border-surface-border bg-surface-card p-4 text-sm">
              {data.topFailureCodes.length === 0 ? (
                <li className="text-gray-500">None</li>
              ) : (
                data.topFailureCodes.map((item) => (
                  <li key={item.code} className="flex justify-between py-1 text-gray-300">
                    <span>{item.code}</span>
                    <span>{item.count}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-medium text-white">Top failure phases</h2>
            <ul className="rounded-lg border border-surface-border bg-surface-card p-4 text-sm">
              {data.topFailurePhases.length === 0 ? (
                <li className="text-gray-500">None</li>
              ) : (
                data.topFailurePhases.map((item) => (
                  <li key={item.phase} className="flex justify-between py-1 text-gray-300">
                    <span>{item.phase}</span>
                    <span>{item.count}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-medium text-white">Workspace editor metrics</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Files opened" value={String(data.workspaceMetrics.filesOpened)} />
            <StatCard label="Files saved" value={String(data.workspaceMetrics.filesSaved)} />
            <StatCard
              label="AI edits requested"
              value={String(data.workspaceMetrics.aiEditsRequested)}
            />
            <StatCard
              label="AI edits applied"
              value={String(data.workspaceMetrics.aiEditsApplied)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
