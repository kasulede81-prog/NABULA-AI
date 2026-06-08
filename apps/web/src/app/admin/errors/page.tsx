"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  Pagination,
  SearchBar,
  TrendStatCard,
} from "@/components/admin/ui";

const SOURCES = ["all", "api", "preview", "github", "ai_provider"] as const;

export default function AdminErrorsPage() {
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<
    Awaited<ReturnType<typeof api.getAdminErrors>>["data"]["events"] | null
  >(null);
  const [stats, setStats] = useState<
    Awaited<ReturnType<typeof api.getAdminErrors>>["data"]["stats"] | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminErrors({
        page,
        limit: 20,
        search: search || undefined,
        source: source === "all" ? undefined : source,
      });
      setEvents(res.data.events);
      setStats(res.data.stats);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load errors");
    } finally {
      setLoading(false);
    }
  }, [page, search, source]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !events) return <LoadingState />;
  if (error && !events) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Error Monitor</h1>
        <p className="text-sm text-gray-500">API, preview, GitHub, and AI provider failures</p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrendStatCard label="Total Events" value={stats.totalEvents} />
          <TrendStatCard label="Last 24h" value={stats.last24h} />
          {stats.bySource.map((s) => (
            <TrendStatCard
              key={s.source}
              label={s.source}
              value={s.count}
              suffix=" (7d)"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search code or message..."
        />
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          className="rounded border border-surface-border bg-surface px-2 py-1.5 text-xs text-white"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sources" : s}
            </option>
          ))}
        </select>
      </div>

      {events && events.items.length === 0 ? (
        <p className="text-sm text-gray-500">No errors recorded</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-surface-border bg-surface-card text-gray-500">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {events?.items.map((e) => (
                <tr key={e.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3 capitalize text-gray-300">{e.source}</td>
                  <td className="px-4 py-3 font-mono text-nebula-400">{e.code}</td>
                  <td className="max-w-md truncate px-4 py-3 text-gray-400">{e.message}</td>
                  <td className="px-4 py-3 text-gray-500">{e.userEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {events && (
        <Pagination
          page={events.page}
          totalPages={events.totalPages}
          onPage={setPage}
        />
      )}
    </div>
  );
}
