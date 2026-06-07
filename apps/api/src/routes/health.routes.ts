import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { getAgentReadiness } from "../config/agent-readiness";
import {
  getSupabaseHealthReport,
  getSupabaseReadinessWithDb,
} from "../config/supabase-readiness";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    const agents = getAgentReadiness();
    const supabase = getSupabaseHealthReport();
    return {
      status: "ok",
      version: "0.1.0",
      provider: agents.provider,
      configured: agents.configured,
      supabase: {
        configured: supabase.configured,
        database: supabase.database,
        auth: supabase.auth,
        storage: supabase.storage,
      },
      agents: {
        ready: agents.ready,
        provider: agents.provider,
        configured: agents.configured,
        anthropicConfigured: agents.anthropicConfigured,
      },
    };
  });

  app.get("/health/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const agents = getAgentReadiness();
      const supabase = await getSupabaseReadinessWithDb();
      const body = {
        status: agents.ready && supabase.configured ? "ready" : "degraded",
        database: "ready",
        provider: agents.provider,
        configured: agents.configured,
        supabase: {
          configured: supabase.configured,
          database: supabase.database,
          auth: supabase.auth,
          storage: supabase.storage,
        },
        agents: {
          ready: agents.ready,
          provider: agents.provider,
          configured: agents.configured,
          anthropicConfigured: agents.anthropicConfigured,
          issues: agents.issues,
        },
      };

      if (!agents.ready) {
        return reply.status(503).send(body);
      }

      return body;
    } catch {
      return reply.status(503).send({ status: "not_ready", database: "unavailable" });
    }
  });
}
