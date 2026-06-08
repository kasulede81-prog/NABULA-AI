"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  TrendStatCard,
} from "@/components/admin/ui";

interface GithubStats {
  connectedAccounts: number;
  repositoriesCreated: number;
  exportSuccessRate: number;
  exportFailures: number;
  syncSuccesses: number;
  createSuccesses: number;
  oauthConfigured: boolean;
  recentConnections: Array<{
    id: string;
    username: string;
    tokenType: string;
    userEmail: string;
    connectedAt: string;
  }>;
  recentRepositories: Array<{
    id: string;
    repositoryName: string;
    repositoryUrl: string;
    projectName: string;
    lastCommitSha: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
  }>;
  recentFailures: Array<{
    id: string;
    message: string | null;
    createdAt: string;
  }>;
}

export default function AdminGithubPage() {
  const [data, setData] = useState<GithubStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminGithub();
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load GitHub stats");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">GitHub Export</h1>
        <p className="text-sm text-gray-500">
          OAuth {data.oauthConfigured ? "configured" : "not configured"} · connected accounts and
          repository exports
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendStatCard label="Connected Accounts" value={data.connectedAccounts} />
        <TrendStatCard label="Repositories Created" value={data.repositoriesCreated} />
        <TrendStatCard
          label="Export Success Rate"
          value={data.exportSuccessRate}
          suffix="%"
        />
        <TrendStatCard label="Export Failures" value={data.exportFailures} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Recent Connections</h2>
          {data.recentConnections.length === 0 ? (
            <p className="text-xs text-gray-500">No connections yet</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.recentConnections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-gray-400"
                >
                  <span>
                    @{c.username}{" "}
                    <span className="text-gray-600">({c.tokenType})</span>
                  </span>
                  <span className="truncate text-gray-600">{c.userEmail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Recent Repositories</h2>
          {data.recentRepositories.length === 0 ? (
            <p className="text-xs text-gray-500">No repositories yet</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.recentRepositories.map((r) => (
                <li key={r.id} className="text-gray-400">
                  <a
                    href={r.repositoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-nebula-400 hover:underline"
                  >
                    {r.repositoryName}
                  </a>
                  <span className="text-gray-600"> · {r.projectName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Recent Sync Failures</h2>
        {data.recentFailures.length === 0 ? (
          <p className="text-xs text-gray-500">No failures recorded</p>
        ) : (
          <ul className="space-y-2 text-xs text-gray-400">
            {data.recentFailures.map((f) => (
              <li key={f.id}>
                <span className="text-red-400">{f.message ?? "Sync failed"}</span>
                <span className="text-gray-600">
                  {" "}
                  · {new Date(f.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
