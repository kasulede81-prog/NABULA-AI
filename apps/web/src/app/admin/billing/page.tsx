"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  ErrorState,
  LoadingState,
  TrendStatCard,
} from "@/components/admin/ui";

interface PendingUpgrade {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  requestedPlan: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface BillingAdminStats {
  estimatedRevenueUsd: number;
  activeSubscriptions: number;
  proSubscriptions: number;
  freeSubscriptions: number;
  totalCreditsConsumed: number;
  usageThisMonth: number;
  usageToday: number;
  quotaExceededEvents: number;
  usageByType: Array<{
    eventType: string;
    count: number;
    creditsConsumed: number;
  }>;
  recentLedger: Array<{
    id: string;
    userId: string;
    type: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
  }>;
  pendingUpgrades: PendingUpgrade[];
}

export default function AdminBillingPage() {
  const [data, setData] = useState<BillingAdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminBilling();
      setData(res.data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load billing stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await api.approveUpgradeRequest(id);
      await load();
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Approve failed");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    const notes = window.prompt("Rejection reason (optional):") ?? undefined;
    setActionId(id);
    try {
      await api.rejectUpgradeRequest(id, notes);
      await load();
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Reject failed");
    } finally {
      setActionId(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Billing</h1>
        <p className="text-sm text-gray-500">
          Revenue estimates, subscriptions, and credit consumption
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <section className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4">
        <h2 className="mb-3 text-sm font-medium text-white">
          Pending upgrade requests ({data.pendingUpgrades.length})
        </h2>
        {data.pendingUpgrades.length === 0 ? (
          <p className="text-xs text-gray-500">No pending requests</p>
        ) : (
          <ul className="space-y-3">
            {data.pendingUpgrades.map((req) => (
              <li
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-surface-border bg-surface-card px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium text-white">
                    {req.userName}{" "}
                    <span className="text-gray-500">({req.userEmail})</span>
                  </p>
                  <p className="text-gray-500">
                    {req.requestedPlan} ·{" "}
                    {new Date(req.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="px-2 py-1 text-xs"
                    onClick={() => void handleApprove(req.id)}
                    loading={actionId === req.id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs text-red-400"
                    onClick={() => void handleReject(req.id)}
                    loading={actionId === req.id}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendStatCard
          label="Est. Revenue (MRR)"
          value={data.estimatedRevenueUsd}
          suffix="USD"
        />
        <TrendStatCard label="Active Subscriptions" value={data.activeSubscriptions} />
        <TrendStatCard label="Pro Subscribers" value={data.proSubscriptions} />
        <TrendStatCard label="Free Subscribers" value={data.freeSubscriptions} />
        <TrendStatCard label="Usage This Month" value={data.usageThisMonth} />
        <TrendStatCard label="Usage Today" value={data.usageToday} />
        <TrendStatCard
          label="Credits Consumed (all time)"
          value={data.totalCreditsConsumed}
        />
        <TrendStatCard label="Quota Exceeded Events" value={data.quotaExceededEvents} />
      </div>

      <section className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Usage by type (this month)</h2>
        {data.usageByType.length === 0 ? (
          <p className="text-xs text-gray-500">No usage yet</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {data.usageByType.map((row) => (
              <li key={row.eventType} className="flex justify-between text-gray-400">
                <span className="capitalize">{row.eventType.replace(/_/g, " ")}</span>
                <span>
                  {row.count} events · {row.creditsConsumed} credits
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Recent credit ledger</h2>
        {data.recentLedger.length === 0 ? (
          <p className="text-xs text-gray-500">No ledger entries</p>
        ) : (
          <ul className="space-y-2 text-xs text-gray-400">
            {data.recentLedger.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {e.type}{" "}
                  <span className={e.amount >= 0 ? "text-green-400" : "text-red-400"}>
                    {e.amount >= 0 ? "+" : ""}
                    {e.amount}
                  </span>
                </span>
                <span className="text-gray-600">
                  balance {e.balanceAfter} · {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
