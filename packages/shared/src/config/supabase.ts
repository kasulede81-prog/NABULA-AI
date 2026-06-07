import { z } from "zod";

/** Production site — single source of truth for Nebula deployments. */
export const NEBULA_PRODUCTION_SITE_URL = "https://dev.ugazon.com";

export const NEBULA_PRODUCTION_AUTH_CALLBACK =
  "https://dev.ugazon.com/auth/callback";

export const DEFAULT_SUPABASE_STORAGE_BUCKET = "uploads";

/** Canonical environment variable names. */
export const SupabaseEnvKeys = {
  DATABASE_URL: "DATABASE_URL",
  DIRECT_URL: "DIRECT_URL",
  SUPABASE_URL: "NEXT_PUBLIC_SUPABASE_URL",
  SUPABASE_ANON_KEY: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  SITE_URL: "NEXT_PUBLIC_SITE_URL",
  AUTH_REDIRECT_URL: "SUPABASE_AUTH_REDIRECT_URL",
  STORAGE_BUCKET: "SUPABASE_STORAGE_BUCKET",
  /** Reserved for future OAuth — configure providers in Supabase dashboard. */
  AUTH_GOOGLE_ENABLED: "SUPABASE_AUTH_GOOGLE_ENABLED",
  AUTH_GITHUB_ENABLED: "SUPABASE_AUTH_GITHUB_ENABLED",
} as const;

const urlSchema = z.string().url();

const publicEnvSchema = z.object({
  [SupabaseEnvKeys.SUPABASE_URL]: urlSchema,
  [SupabaseEnvKeys.SUPABASE_ANON_KEY]: z.string().min(1),
  [SupabaseEnvKeys.SITE_URL]: urlSchema.default(NEBULA_PRODUCTION_SITE_URL),
});

const serverRequiredSchema = z.object({
  [SupabaseEnvKeys.DATABASE_URL]: urlSchema,
  [SupabaseEnvKeys.DIRECT_URL]: urlSchema,
  [SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY]: z.string().min(1),
  [SupabaseEnvKeys.SUPABASE_URL]: urlSchema,
  [SupabaseEnvKeys.SUPABASE_ANON_KEY]: z.string().min(1),
  [SupabaseEnvKeys.SITE_URL]: urlSchema.default(NEBULA_PRODUCTION_SITE_URL),
  [SupabaseEnvKeys.AUTH_REDIRECT_URL]: urlSchema.default(
    NEBULA_PRODUCTION_AUTH_CALLBACK
  ),
  [SupabaseEnvKeys.STORAGE_BUCKET]: z
    .string()
    .min(1)
    .default(DEFAULT_SUPABASE_STORAGE_BUCKET),
  [SupabaseEnvKeys.AUTH_GOOGLE_ENABLED]: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
  [SupabaseEnvKeys.AUTH_GITHUB_ENABLED]: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
  siteUrl: string;
}

export interface SupabaseServerConfig extends SupabasePublicConfig {
  databaseUrl: string;
  directUrl: string;
  serviceRoleKey: string;
  authRedirectUrl: string;
  storageBucket: string;
  oauth: {
    googleEnabled: boolean;
    githubEnabled: boolean;
  };
}

export interface SupabaseHealthStatus {
  configured: boolean;
  database: boolean;
  auth: boolean;
  storage: boolean;
  realtime: boolean;
}

function readEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return env as Record<string, string | undefined>;
}

/** Parse public Supabase config (browser + SSR). Returns null if incomplete. */
export function getSupabasePublicConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SupabasePublicConfig | null {
  const raw = readEnv(env);
  const parsed = publicEnvSchema.safeParse({
    [SupabaseEnvKeys.SUPABASE_URL]: raw[SupabaseEnvKeys.SUPABASE_URL],
    [SupabaseEnvKeys.SUPABASE_ANON_KEY]: raw[SupabaseEnvKeys.SUPABASE_ANON_KEY],
    [SupabaseEnvKeys.SITE_URL]: raw[SupabaseEnvKeys.SITE_URL],
  });

  if (!parsed.success) return null;

  return {
    url: parsed.data[SupabaseEnvKeys.SUPABASE_URL],
    anonKey: parsed.data[SupabaseEnvKeys.SUPABASE_ANON_KEY],
    siteUrl: parsed.data[SupabaseEnvKeys.SITE_URL],
  };
}

/**
 * Parse full server Supabase config. Throws if API-required variables are missing.
 * Fail-fast entry point for API startup.
 */
export function getSupabaseServerConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SupabaseServerConfig {
  const raw = readEnv(env);
  const parsed = serverRequiredSchema.safeParse({
    [SupabaseEnvKeys.DATABASE_URL]: raw[SupabaseEnvKeys.DATABASE_URL],
    [SupabaseEnvKeys.DIRECT_URL]: raw[SupabaseEnvKeys.DIRECT_URL],
    [SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY]:
      raw[SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY],
    [SupabaseEnvKeys.SUPABASE_URL]: raw[SupabaseEnvKeys.SUPABASE_URL],
    [SupabaseEnvKeys.SUPABASE_ANON_KEY]: raw[SupabaseEnvKeys.SUPABASE_ANON_KEY],
    [SupabaseEnvKeys.SITE_URL]: raw[SupabaseEnvKeys.SITE_URL],
    [SupabaseEnvKeys.AUTH_REDIRECT_URL]: raw[SupabaseEnvKeys.AUTH_REDIRECT_URL],
    [SupabaseEnvKeys.STORAGE_BUCKET]: raw[SupabaseEnvKeys.STORAGE_BUCKET],
    [SupabaseEnvKeys.AUTH_GOOGLE_ENABLED]:
      raw[SupabaseEnvKeys.AUTH_GOOGLE_ENABLED],
    [SupabaseEnvKeys.AUTH_GITHUB_ENABLED]:
      raw[SupabaseEnvKeys.AUTH_GITHUB_ENABLED],
  });

  if (!parsed.success) {
    const missing = parsed.error.errors
      .map((e) => e.path.join(".") || e.message)
      .join("; ");
    throw new Error(
      `Supabase server configuration invalid or incomplete: ${missing}`
    );
  }

  const data = parsed.data;
  return {
    databaseUrl: data[SupabaseEnvKeys.DATABASE_URL],
    directUrl: data[SupabaseEnvKeys.DIRECT_URL],
    serviceRoleKey: data[SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY],
    url: data[SupabaseEnvKeys.SUPABASE_URL],
    anonKey: data[SupabaseEnvKeys.SUPABASE_ANON_KEY],
    siteUrl: data[SupabaseEnvKeys.SITE_URL],
    authRedirectUrl: data[SupabaseEnvKeys.AUTH_REDIRECT_URL],
    storageBucket: data[SupabaseEnvKeys.STORAGE_BUCKET],
    oauth: {
      googleEnabled: data[SupabaseEnvKeys.AUTH_GOOGLE_ENABLED] === "true",
      githubEnabled: data[SupabaseEnvKeys.AUTH_GITHUB_ENABLED] === "true",
    },
  };
}

/** Env-only health flags (no network I/O). */
export function getSupabaseEnvHealth(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SupabaseHealthStatus {
  const raw = readEnv(env);
  const hasDatabase =
    !!raw[SupabaseEnvKeys.DATABASE_URL] && !!raw[SupabaseEnvKeys.DIRECT_URL];
  const hasAuth =
    !!raw[SupabaseEnvKeys.SUPABASE_URL] &&
    !!raw[SupabaseEnvKeys.SUPABASE_ANON_KEY] &&
    !!raw[SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY];
  const hasStorage =
    hasAuth && !!(raw[SupabaseEnvKeys.STORAGE_BUCKET] ?? DEFAULT_SUPABASE_STORAGE_BUCKET);
  const hasRealtime =
    !!raw[SupabaseEnvKeys.SUPABASE_URL] &&
    !!raw[SupabaseEnvKeys.SUPABASE_ANON_KEY];
  const configured = hasDatabase && hasAuth && hasStorage;

  return {
    configured,
    database: hasDatabase,
    auth: hasAuth,
    storage: hasStorage,
    realtime: hasRealtime,
  };
}

/** Log warnings for missing public Supabase env (web startup). */
export function warnIfSupabasePublicEnvMissing(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): void {
  const raw = readEnv(env);
  const missing: string[] = [];

  if (!raw[SupabaseEnvKeys.SUPABASE_URL]) {
    missing.push(SupabaseEnvKeys.SUPABASE_URL);
  }
  if (!raw[SupabaseEnvKeys.SUPABASE_ANON_KEY]) {
    missing.push(SupabaseEnvKeys.SUPABASE_ANON_KEY);
  }

  if (missing.length > 0) {
    console.warn(
      `[nebula] Supabase public config incomplete — missing: ${missing.join(", ")}. ` +
        "Auth, Realtime, and Storage client features will be unavailable."
    );
  }
}

/** Returns true when site/auth URLs target the production domain. */
export function isProductionDomainConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const raw = readEnv(env);
  const site = raw[SupabaseEnvKeys.SITE_URL] ?? NEBULA_PRODUCTION_SITE_URL;
  const redirect =
    raw[SupabaseEnvKeys.AUTH_REDIRECT_URL] ?? NEBULA_PRODUCTION_AUTH_CALLBACK;

  try {
    const siteHost = new URL(site).hostname;
    const redirectHost = new URL(redirect).hostname;
    const prodHost = new URL(NEBULA_PRODUCTION_SITE_URL).hostname;
    return siteHost === prodHost && redirectHost === prodHost;
  } catch {
    return false;
  }
}
