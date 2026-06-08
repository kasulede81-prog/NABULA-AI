import type { SystemServiceStatus } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { getAgentReadiness } from "../../config/agent-readiness";
import { previewService } from "../preview.service";
export class StabilityHealthService {
  async getExtendedChecks(): Promise<{
    services: Array<{
      service: string;
      status: SystemServiceStatus;
      latencyMs: number | null;
      details?: Record<string, unknown>;
    }>;
    backup: {
      databaseReachable: boolean;
      lastMetricCheck: string | null;
    };
  }> {
    const services: Array<{
      service: string;
      status: SystemServiceStatus;
      latencyMs: number | null;
      details?: Record<string, unknown>;
    }> = [];

    const dbStart = Date.now();
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    services.push({
      service: "database_connectivity",
      status: dbOk ? "healthy" : "down",
      latencyMs: Date.now() - dbStart,
    });

    services.push({
      service: "preview_health",
      status: previewService.isConfigured() ? "healthy" : "down",
      latencyMs: null,
      details: {
        template: env.E2B_PREVIEW_TEMPLATE,
        configured: previewService.isConfigured(),
      },
    });

    const githubStart = Date.now();
    let githubStatus: SystemServiceStatus = "unknown";
    const githubDetails: Record<string, unknown> = {
      oauthConfigured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    };
    if (env.GITHUB_CLIENT_ID) {
      githubStatus = "healthy";
    } else {
      githubStatus = "degraded";
    }
    services.push({
      service: "github_connectivity",
      status: githubStatus,
      latencyMs: Date.now() - githubStart,
      details: githubDetails,
    });

    const agents = getAgentReadiness();
    const activeProvider = agents.provider;
    services.push({
      service: "ai_provider_connectivity",
      status:
        agents.configured && agents.ready
          ? "healthy"
          : agents.configured
            ? "degraded"
            : "down",
      latencyMs: null,
      details: {
        provider: activeProvider,
        configured: agents.configured,
        ready: agents.ready,
      },
    });

    const storageStart = Date.now();
    let storageOk = false;
    try {
      const bucket = env.SUPABASE_STORAGE_BUCKET;
      storageOk = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && bucket);
    } catch {
      storageOk = false;
    }
    services.push({
      service: "storage_health",
      status: storageOk ? "healthy" : "degraded",
      latencyMs: Date.now() - storageStart,
      details: {
        bucket: env.SUPABASE_STORAGE_BUCKET,
        supabaseUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      },
    });

    const lastMetric = await prisma.systemMetric.findFirst({
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true },
    });

    return {
      services,
      backup: {
        databaseReachable: dbOk,
        lastMetricCheck: lastMetric?.checkedAt.toISOString() ?? null,
      },
    };
  }
}

export const stabilityHealthService = new StabilityHealthService();
