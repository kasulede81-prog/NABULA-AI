"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SupportChatPanel } from "@/components/support/SupportChatPanel";
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_URL } from "@nebula/shared";

interface BillingStatus {
  plan: string;
  status: string;
  creditsRemaining: number;
  renewsAt: string | null;
  priorityQueue: boolean;
  stripeConfigured?: boolean;
  limits: {
    monthlyProjects: number | null;
    dailyAiRequests: number | null;
    dailyPreviews: number | null;
    monthlyCredits: number | null;
  };
  usage: {
    projectsThisMonth: number;
    aiRequestsToday: number;
    previewsToday: number;
    buildsUsedThisPeriod: number;
  };
}

interface UsageRow {
  id: string;
  eventType: string;
  creditsConsumed: number;
  projectId: string | null;
  createdAt: string;
}

function formatLimit(used: number, limit: number | null): string {
  if (limit === null) return `${used} / unlimited`;
  return `${used} / ${limit}`;
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, usageRes, notifRes] = await Promise.all([
        api.getBillingStatus(),
        api.getBillingUsage(),
        api.getSupportNotifications(),
      ]);
      setStatus(statusRes.data);
      setUsage(usageRes.data);
      setPendingUpgrade(notifRes.data.pendingUpgrade);
      setUnreadMessages(notifRes.data.unreadMessages);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpgradeToPro = async () => {
    setUpgrading(true);
    setError(null);
    try {
      if (status?.stripeConfigured) {
        const res = await api.createStripeCheckout();
        window.location.href = res.data.url;
        return;
      }
      const res = await api.requestProUpgrade();
      setPendingUpgrade(true);
      setChatOpen(true);
      if (!res.data.alreadyPending) {
        setUnreadMessages(0);
      }
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to start upgrade");
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    setUpgrading(true);
    setError(null);
    try {
      const res = await api.createStripePortal();
      window.location.href = res.data.url;
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to open billing portal");
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading billing...</p>;
  }

  if (error && !status) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-nebula-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) return null;

  const isPro = status.plan === "pro";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex gap-4 text-xs">
          <Link href="/projects" className="text-gray-500 hover:text-gray-300">
            ← Projects
          </Link>
          <Link href="/settings/feedback" className="text-gray-500 hover:text-gray-300">
            Send feedback
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-white">Billing & Usage</h1>
        <p className="text-sm text-gray-500">Plan, credits, and consumption</p>
      </div>

      <section className="rounded-lg border border-surface-border bg-surface-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Current plan</p>
            <p className="mt-1 text-2xl font-semibold capitalize text-white">
              {status.plan}
            </p>
            <p className="text-xs text-gray-500">
              Status: {status.status}
              {status.priorityQueue ? " · Priority queue" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Credits</p>
            <p className="mt-1 text-2xl font-semibold text-nebula-400">
              {isPro ? "Unlimited" : status.creditsRemaining}
            </p>
            {status.renewsAt && !isPro && (
              <p className="text-xs text-gray-500">
                Renews {new Date(status.renewsAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-surface-border bg-surface-card p-5">
        <h2 className="text-sm font-medium text-white">Usage this period</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Projects (month)</dt>
            <dd className="text-white">
              {formatLimit(status.usage.projectsThisMonth, status.limits.monthlyProjects)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">AI requests (today)</dt>
            <dd className="text-white">
              {formatLimit(status.usage.aiRequestsToday, status.limits.dailyAiRequests)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Previews (today)</dt>
            <dd className="text-white">
              {formatLimit(status.usage.previewsToday, status.limits.dailyPreviews)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Monthly credits pool</dt>
            <dd className="text-white">
              {status.limits.monthlyCredits === null
                ? "Unlimited"
                : `${status.limits.monthlyCredits} / month`}
            </dd>
          </div>
        </dl>
      </section>

      {!isPro && (
        <section className="rounded-lg border border-nebula-800/40 bg-nebula-950/20 p-5">
          <h2 className="text-sm font-medium text-white">Upgrade to Pro</h2>
          <p className="mt-1 text-sm text-gray-400">
            Unlimited projects, higher preview limits, priority queue, and unlimited credits.
          </p>
          {pendingUpgrade && (
            <p className="mt-2 text-xs text-amber-400">
              Upgrade request pending — our team will review it shortly.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="px-4 py-2 text-sm"
              onClick={handleUpgradeToPro}
              loading={upgrading}
            >
              Upgrade to Pro
            </Button>
            <Button
              variant="ghost"
              className="px-4 py-2 text-sm"
              onClick={() => setChatOpen(true)}
            >
              Open Support Chat
              {unreadMessages > 0 && (
                <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {unreadMessages}
                </span>
              )}
            </Button>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-surface-border px-4 py-2 text-sm text-gray-300 hover:bg-surface-card"
            >
              WhatsApp {SUPPORT_WHATSAPP_NUMBER}
            </a>
          </div>
        </section>
      )}

      {isPro && (
        <section className="rounded-lg border border-surface-border bg-surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-white">Pro subscription</h2>
            <div className="flex gap-2">
              {status.stripeConfigured && (
                <Button
                  variant="ghost"
                  className="px-3 py-1 text-xs"
                  onClick={() => void handleManageBilling()}
                  loading={upgrading}
                >
                  Manage billing
                </Button>
              )}
              <Button
                variant="ghost"
                className="px-3 py-1 text-xs"
                onClick={() => setChatOpen(true)}
              >
                Support chat
                {unreadMessages > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                    {unreadMessages}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-surface-border bg-surface-card p-5">
        <h2 className="text-sm font-medium text-white">Recent activity</h2>
        {usage.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500">No usage recorded yet</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {usage.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between text-xs text-gray-400"
              >
                <span className="capitalize text-gray-300">
                  {row.eventType.replace(/_/g, " ")}
                </span>
                <span>
                  {row.creditsConsumed > 0 ? `-${row.creditsConsumed} credits` : "—"}
                  <span className="ml-2 text-gray-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SupportChatPanel
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          void load();
        }}
        showUpgradeHint={!isPro && !pendingUpgrade}
        onUpgradeRequest={() => setPendingUpgrade(true)}
      />
    </div>
  );
}
