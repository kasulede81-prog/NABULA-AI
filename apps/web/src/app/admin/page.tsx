"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type BuildFilter = "all" | "ready" | "failed" | "building";

interface Overview {
  totalUsers: number;
  totalProjects: number;
  readyProjects: number;
  failedProjects: number;
  activePreviews: number;
  githubExports: number;
  estimatedAiCostUsd: number;
}

interface AdminUser {
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

interface BuildRun {
  id: string;
  userName: string;
  userEmail: string;
  projectName: string;
  projectStatus: string;
  provider: string;
  status: string;
  durationMs: number | null;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number | null;
  createdAt: string;
}

interface PreviewRow {
  id: string;
  projectId: string;
  projectName: string;
  userName: string;
  userEmail: string;
  status: string;
  sandboxId: string | null;
  estimatedCostUsd: number | null;
  expiresAt: string | null;
}

interface AiAnalytics {
  daily: Array<{
    date: string;
    builds: number;
    successful: number;
    failed: number;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
    successRate: number;
  }>;
  summary: {
    totalBuilds: number;
    successRate: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    totalCostUsd: number;
  };
}

interface SystemHealth {
  database: boolean;
  supabase: {
    configured: boolean;
    database: boolean;
    auth: boolean;
    storage: boolean;
  };
  deepseek: { configured: boolean; provider: string };
  github: { configured: boolean; dedicatedEncryptionKey: boolean };
  e2b: { configured: boolean; template: string };
}

interface AuditLog {
  id: string;
  type: string;
  message: string;
  userEmail: string | null;
  projectName: string | null;
  createdAt: string;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function HealthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-card px-4 py-3">
      <span
        className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      />
      <span className="text-sm text-white">{label}</span>
      <span className={`ml-auto text-xs ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {ok ? "Healthy" : "Down"}
      </span>
    </div>
  );
}

type DailyMetric = AiAnalytics["daily"][number];

function BarChart({
  data,
  getValue,
  maxValue,
  formatValue,
}: {
  data: DailyMetric[];
  getValue: (d: DailyMetric) => number;
  maxValue: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d) => {
        const v = getValue(d);
        const pct = maxValue > 0 ? (v / maxValue) * 100 : 0;
        return (
          <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-nebula-600 transition-colors group-hover:bg-nebula-500"
              style={{ height: `${Math.max(pct, v > 0 ? 4 : 0)}%` }}
              title={`${d.date}: ${formatValue ? formatValue(v) : v}`}
            />
            <span className="hidden text-[10px] text-gray-600 sm:block">
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-white">{title}</h2>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function tableWrap(children: React.ReactNode) {
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

const thClass = "px-4 py-3 font-medium";
const tdClass = "px-4 py-3 text-gray-300";

export default function AdminDashboardPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [builds, setBuilds] = useState<BuildRun[]>([]);
  const [buildFilter, setBuildFilter] = useState<BuildFilter>("all");
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [aiAnalytics, setAiAnalytics] = useState<AiAnalytics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadBuilds = useCallback(async (filter: BuildFilter) => {
    const res = await api.getAdminBuilds(filter);
    setBuilds(res.data);
  }, []);

  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [ov, us, bd, pr, ai, hl, al] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminUsers(),
        api.getAdminBuilds(buildFilter),
        api.getAdminPreviews(),
        api.getAdminAiAnalytics(),
        api.getAdminHealth(),
        api.getAdminAuditLogs(),
      ]);
      setOverview(ov.data);
      setUsers(us.data);
      setBuilds(bd.data);
      setPreviews(pr.data);
      setAiAnalytics(ai.data);
      setHealth(hl.data);
      setAuditLogs(al.data);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load admin dashboard");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [buildFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!loading) {
      loadBuilds(buildFilter).catch(() => undefined);
    }
  }, [buildFilter, loadBuilds, loading]);

  async function runAction(key: string, fn: () => Promise<unknown>) {
    setActionLoading(key);
    try {
      await fn();
      await loadAll({ silent: true });
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading admin dashboard...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link href="/projects" className="text-sm text-nebula-400 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const maxBuilds = Math.max(...(aiAnalytics?.daily.map((d) => d.builds) ?? [1]), 1);
  const maxTokens = Math.max(
    ...(aiAnalytics?.daily.map((d) => d.tokensInput + d.tokensOutput) ?? [1]),
    1
  );
  const maxCost = Math.max(...(aiAnalytics?.daily.map((d) => d.costUsd) ?? [1]), 1);

  return (
    <div className="min-h-screen bg-surface p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-gray-500">Nebula AI — platform operations</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link href="/admin/analytics" className="text-nebula-400 hover:underline">
              Build analytics
            </Link>
            <Link href="/projects" className="text-nebula-400 hover:underline">
              Projects
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {overview && (
          <Section title="Overview">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
              <StatCard label="Total users" value={String(overview.totalUsers)} />
              <StatCard label="Total projects" value={String(overview.totalProjects)} />
              <StatCard label="Ready projects" value={String(overview.readyProjects)} />
              <StatCard label="Failed projects" value={String(overview.failedProjects)} />
              <StatCard label="Active previews" value={String(overview.activePreviews)} />
              <StatCard label="GitHub exports" value={String(overview.githubExports)} />
              <StatCard
                label="Est. AI cost"
                value={`$${overview.estimatedAiCostUsd.toFixed(2)}`}
              />
            </div>
          </Section>
        )}

        <Section title="User Management" description="Suspend, upgrade, and reset build limits">
          {tableWrap(
            <>
              <thead className="bg-surface-card text-left text-gray-500">
                <tr>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Plan</th>
                  <th className={thClass}>Projects</th>
                  <th className={thClass}>Builds</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Created</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {users.map((u) => (
                  <tr key={u.id} className="bg-surface-card/50">
                    <td className={tdClass}>{u.name}</td>
                    <td className={tdClass}>{u.email}</td>
                    <td className={tdClass}>{u.plan}</td>
                    <td className={tdClass}>{u.projectsCount}</td>
                    <td className={tdClass}>
                      {u.buildsUsed} / {u.buildsLimit}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={
                          u.status === "active" ? "text-emerald-400" : "text-amber-400"
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1">
                        {u.status === "active" ? (
                          <ActionBtn
                            label="Suspend"
                            loading={actionLoading === `suspend-${u.id}`}
                            onClick={() =>
                              runAction(`suspend-${u.id}`, () => api.suspendUser(u.id))
                            }
                          />
                        ) : (
                          <ActionBtn
                            label="Reactivate"
                            loading={actionLoading === `reactivate-${u.id}`}
                            onClick={() =>
                              runAction(`reactivate-${u.id}`, () =>
                                api.reactivateUser(u.id)
                              )
                            }
                          />
                        )}
                        {u.plan !== "pro" && (
                          <ActionBtn
                            label="Upgrade Pro"
                            loading={actionLoading === `upgrade-${u.id}`}
                            onClick={() =>
                              runAction(`upgrade-${u.id}`, () =>
                                api.upgradeUserToPro(u.id)
                              )
                            }
                          />
                        )}
                        <ActionBtn
                          label="Reset limits"
                          loading={actionLoading === `reset-${u.id}`}
                          onClick={() =>
                            runAction(`reset-${u.id}`, () =>
                              api.resetUserBuildLimits(u.id)
                            )
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </Section>

        <Section title="Build Monitoring" description="Builder agent runs">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", "ready", "failed", "building"] as BuildFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBuildFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium uppercase ${
                  buildFilter === f
                    ? "bg-nebula-600 text-white"
                    : "bg-surface-card text-gray-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {tableWrap(
            <>
              <thead className="bg-surface-card text-left text-gray-500">
                <tr>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>Provider</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Duration</th>
                  <th className={thClass}>Tokens</th>
                  <th className={thClass}>Cost</th>
                  <th className={thClass}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {builds.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      No builds match this filter
                    </td>
                  </tr>
                ) : (
                  builds.map((b) => (
                    <tr key={b.id} className="bg-surface-card/50">
                      <td className={tdClass}>
                        <div>{b.userName}</div>
                        <div className="text-xs text-gray-500">{b.userEmail}</div>
                      </td>
                      <td className={tdClass}>
                        <div>{b.projectName}</div>
                        <div className="text-xs text-gray-500">{b.projectStatus}</div>
                      </td>
                      <td className={tdClass}>{b.provider}</td>
                      <td className={tdClass}>{b.status}</td>
                      <td className={tdClass}>
                        {b.durationMs != null
                          ? `${(b.durationMs / 1000).toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className={tdClass}>
                        {b.tokensInput} / {b.tokensOutput}
                      </td>
                      <td className={tdClass}>
                        {b.estimatedCostUsd != null
                          ? `$${b.estimatedCostUsd.toFixed(4)}`
                          : "—"}
                      </td>
                      <td className={tdClass}>
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </Section>

        <Section title="Preview Monitoring">
          {tableWrap(
            <>
              <thead className="bg-surface-card text-left text-gray-500">
                <tr>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Sandbox ID</th>
                  <th className={thClass}>Est. cost</th>
                  <th className={thClass}>Expires</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {previews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No previews
                    </td>
                  </tr>
                ) : (
                  previews.map((p) => (
                    <tr key={p.id} className="bg-surface-card/50">
                      <td className={tdClass}>{p.projectName}</td>
                      <td className={tdClass}>
                        <div>{p.userName}</div>
                        <div className="text-xs text-gray-500">{p.userEmail}</div>
                      </td>
                      <td className={tdClass}>{p.status}</td>
                      <td className={`${tdClass} font-mono text-xs`}>
                        {p.sandboxId ?? "—"}
                      </td>
                      <td className={tdClass}>
                        {p.estimatedCostUsd != null
                          ? `$${p.estimatedCostUsd.toFixed(4)}`
                          : "—"}
                      </td>
                      <td className={tdClass}>
                        {p.expiresAt
                          ? new Date(p.expiresAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1">
                          {(p.status === "starting" || p.status === "ready") && (
                            <ActionBtn
                              label="Stop"
                              loading={actionLoading === `stop-${p.projectId}`}
                              onClick={() =>
                                runAction(`stop-${p.projectId}`, () =>
                                  api.stopAdminPreview(p.projectId)
                                )
                              }
                            />
                          )}
                          <ActionBtn
                            label="Delete"
                            variant="danger"
                            loading={actionLoading === `delete-${p.projectId}`}
                            onClick={() =>
                              runAction(`delete-${p.projectId}`, () =>
                                api.deleteAdminPreview(p.projectId)
                              )
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </Section>

        {aiAnalytics && (
          <Section title="AI Analytics" description="Last 14 days">
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Total builds"
                value={String(aiAnalytics.summary.totalBuilds)}
              />
              <StatCard
                label="Success rate"
                value={`${(aiAnalytics.summary.successRate * 100).toFixed(1)}%`}
              />
              <StatCard
                label="Total tokens"
                value={`${aiAnalytics.summary.totalTokensInput + aiAnalytics.summary.totalTokensOutput}`}
              />
              <StatCard
                label="Total cost"
                value={`$${aiAnalytics.summary.totalCostUsd.toFixed(2)}`}
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <ChartCard title="Builds per day">
                <BarChart
                  data={aiAnalytics.daily}
                  getValue={(d) => d.builds}
                  maxValue={maxBuilds}
                />
              </ChartCard>
              <ChartCard title="Success rate">
                <BarChart
                  data={aiAnalytics.daily}
                  getValue={(d) => d.successRate * 100}
                  maxValue={100}
                  formatValue={(v) => `${v.toFixed(0)}%`}
                />
              </ChartCard>
              <ChartCard title="Token usage">
                <BarChart
                  data={aiAnalytics.daily}
                  getValue={(d) => d.tokensInput + d.tokensOutput}
                  maxValue={maxTokens}
                />
              </ChartCard>
              <ChartCard title="Cost per day">
                <BarChart
                  data={aiAnalytics.daily}
                  getValue={(d) => d.costUsd}
                  maxValue={maxCost}
                  formatValue={(v) => `$${v.toFixed(4)}`}
                />
              </ChartCard>
            </div>
          </Section>
        )}

        {health && (
          <Section title="System Health">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <HealthBadge ok={health.database} label="Database" />
              <HealthBadge
                ok={health.supabase.configured && health.supabase.database}
                label="Supabase"
              />
              <HealthBadge ok={health.deepseek.configured} label="DeepSeek" />
              <HealthBadge ok={health.github.configured} label="GitHub" />
              <HealthBadge ok={health.e2b.configured} label="E2B" />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
              <p>
                Supabase — auth: {health.supabase.auth ? "ok" : "missing"}, storage:{" "}
                {health.supabase.storage ? "ok" : "missing"}
              </p>
              <p>
                LLM provider: {health.deepseek.provider} · E2B template:{" "}
                {health.e2b.template}
              </p>
            </div>
          </Section>
        )}

        <Section title="Audit Logs" description="Recent platform events">
          {tableWrap(
            <>
              <thead className="bg-surface-card text-left text-gray-500">
                <tr>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Message</th>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No audit events yet
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={`${log.type}-${log.id}`} className="bg-surface-card/50">
                      <td className={tdClass}>
                        <AuditTypeBadge type={log.type} />
                      </td>
                      <td className={tdClass}>{log.message}</td>
                      <td className={tdClass}>{log.userEmail ?? "—"}</td>
                      <td className={tdClass}>{log.projectName ?? "—"}</td>
                      <td className={tdClass}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  loading,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "default" | "danger";
}) {
  const base =
    variant === "danger"
      ? "border-red-800 text-red-300 hover:bg-red-950"
      : "border-surface-border text-gray-300 hover:bg-surface-border/50";
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${base}`}
    >
      {loading ? "…" : label}
    </button>
  );
}

function AuditTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    "build.completed": "text-emerald-400",
    "build.failed": "text-red-400",
    "preview.created": "text-blue-400",
    "github.export": "text-purple-400",
    "user.upgraded": "text-amber-400",
  };
  return (
    <span className={`font-mono text-xs ${colors[type] ?? "text-gray-400"}`}>
      {type}
    </span>
  );
}
