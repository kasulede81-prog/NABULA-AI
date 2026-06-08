"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  TrendStatCard,
} from "@/components/admin/ui";

interface Overview {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  projectsCreatedToday: number;
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  buildSuccessRate: number;
  buildFailureRate: number;
  activePreviews: number;
  previewFailures: number;
  monthlyAiRequests: number;
  estimatedAiCostUsd: number;
  trends?: {
    projectsToday?: { changePercent: number | null; direction: "up" | "down" | "flat" };
    monthlyAiRequests?: { changePercent: number | null; direction: "up" | "down" | "flat" };
  };
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminOverview();
      setData(res.data as Overview);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to load overview");
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
        <h1 className="text-lg font-semibold text-white">Dashboard Overview</h1>
        <p className="text-sm text-gray-500">Platform metrics at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <TrendStatCard label="Total Users" value={data.totalUsers} />
        <TrendStatCard label="Active Users (30d)" value={data.activeUsers} />
        <TrendStatCard label="Total Projects" value={data.totalProjects} />
        <TrendStatCard
          label="Projects Today"
          value={data.projectsCreatedToday}
          changePercent={data.trends?.projectsToday?.changePercent}
          direction={data.trends?.projectsToday?.direction}
        />
        <TrendStatCard label="Total Builds" value={data.totalBuilds} />
        <TrendStatCard
          label="Successful Builds"
          value={data.successfulBuilds}
          suffix={`${data.buildSuccessRate}%`}
        />
        <TrendStatCard
          label="Failed Builds"
          value={data.failedBuilds}
          suffix={`${data.buildFailureRate}%`}
        />
        <TrendStatCard label="Active Previews" value={data.activePreviews} />
        <TrendStatCard label="Preview Failures" value={data.previewFailures} />
        <TrendStatCard
          label="Monthly AI Requests"
          value={data.monthlyAiRequests}
          changePercent={data.trends?.monthlyAiRequests?.changePercent}
          direction={data.trends?.monthlyAiRequests?.direction}
        />
        <TrendStatCard
          label="Est. AI Cost"
          value={`$${data.estimatedAiCostUsd.toFixed(2)}`}
        />
      </div>
    </div>
  );
}
