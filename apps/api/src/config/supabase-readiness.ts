import {
  getSupabaseEnvHealth,
  getSupabaseServerConfig,
  type SupabaseHealthStatus,
} from "@nebula/shared";
import { prisma } from "../lib/prisma";

export interface SupabaseReadiness extends SupabaseHealthStatus {
  databaseConnected: boolean;
}

let cachedConfig: ReturnType<typeof getSupabaseServerConfig> | null = null;

/** Fail-fast validation — call before API listens. */
export function assertSupabaseServerConfig(): void {
  cachedConfig = getSupabaseServerConfig(process.env);
}

export function getCachedSupabaseConfig() {
  if (!cachedConfig) {
    cachedConfig = getSupabaseServerConfig(process.env);
  }
  return cachedConfig;
}

export function getSupabaseHealthReport(): SupabaseHealthStatus {
  const envHealth = getSupabaseEnvHealth(process.env);
  return {
    configured: envHealth.configured,
    database: envHealth.database,
    auth: envHealth.auth,
    storage: envHealth.storage,
    realtime: envHealth.realtime,
  };
}

export async function getSupabaseReadinessWithDb(): Promise<SupabaseReadiness> {
  const base = getSupabaseHealthReport();
  let databaseConnected = false;

  if (base.database) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseConnected = true;
    } catch {
      databaseConnected = false;
    }
  }

  return {
    ...base,
    database: base.database && databaseConnected,
    databaseConnected,
  };
}
