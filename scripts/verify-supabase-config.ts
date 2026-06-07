/**
 * Supabase environment configuration — static verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_SUPABASE_STORAGE_BUCKET,
  NEBULA_PRODUCTION_AUTH_CALLBACK,
  NEBULA_PRODUCTION_SITE_URL,
  SupabaseEnvKeys,
  getSupabaseEnvHealth,
  getSupabasePublicConfig,
  getSupabaseServerConfig,
  isProductionDomainConfigured,
} from "@nebula/shared";

const ROOT = resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

console.log("Supabase Configuration Verification\n");

const supabaseTs = read("packages/shared/src/config/supabase.ts");
const schema = read("packages/database/prisma/schema.prisma");
const rootEnv = read(".env.example");
const apiEnv = read("apps/api/.env.example");
const webEnv = read("apps/web/.env.example");
const apiEnvTs = read("apps/api/src/config/env.ts");
const healthRoutes = read("apps/api/src/routes/health.routes.ts");
const webConfig = read("apps/web/src/config/supabase.ts");

check("shared config supabase.ts exists", supabaseTs.includes("NEBULA_PRODUCTION_SITE_URL"));
check("production domain dev.ugazon.com", supabaseTs.includes("https://dev.ugazon.com"));
check("SupabaseEnvKeys exported", supabaseTs.includes("SupabaseEnvKeys"));
check("getSupabaseServerConfig", supabaseTs.includes("getSupabaseServerConfig"));
check("getSupabasePublicConfig", supabaseTs.includes("getSupabasePublicConfig"));
check("warnIfSupabasePublicEnvMissing", supabaseTs.includes("warnIfSupabasePublicEnvMissing"));
check("OAuth placeholders", supabaseTs.includes("AUTH_GOOGLE_ENABLED"));

check("Prisma directUrl configured", schema.includes('directUrl = env("DIRECT_URL")'));
check("Prisma url configured", schema.includes('url       = env("DATABASE_URL")'));

const requiredInRoot = [
  "DATABASE_URL=",
  "DIRECT_URL=",
  "NEXT_PUBLIC_SUPABASE_URL=",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "NEXT_PUBLIC_SITE_URL=https://dev.ugazon.com",
  "SUPABASE_AUTH_REDIRECT_URL=https://dev.ugazon.com/auth/callback",
  "SUPABASE_STORAGE_BUCKET=uploads",
];

for (const key of requiredInRoot) {
  check(`root .env.example: ${key}`, rootEnv.includes(key));
}

check("api .env.example has DATABASE_URL", apiEnv.includes("DATABASE_URL="));
check("api .env.example has SUPABASE_SERVICE_ROLE_KEY", apiEnv.includes("SUPABASE_SERVICE_ROLE_KEY="));
check("web .env.example has NEXT_PUBLIC_SUPABASE_URL", webEnv.includes("NEXT_PUBLIC_SUPABASE_URL="));
check("web .env.example has NEXT_PUBLIC_SITE_URL", webEnv.includes("NEXT_PUBLIC_SITE_URL=https://dev.ugazon.com"));

check("API env validates DIRECT_URL", apiEnvTs.includes("DIRECT_URL: z.string().url()"));
check("API env validates SERVICE_ROLE", apiEnvTs.includes("SUPABASE_SERVICE_ROLE_KEY"));
check("API fail-fast supabase", apiEnvTs.includes("getSupabaseServerConfig"));
check("API startup assertSupabase", read("apps/api/src/index.ts").includes("assertSupabaseServerConfig"));

check("health includes supabase", healthRoutes.includes("supabase:"));
check("health supabase.database", healthRoutes.includes("database: supabase.database"));
check("health supabase.auth", healthRoutes.includes("auth: supabase.auth"));
check("health supabase.storage", healthRoutes.includes("storage: supabase.storage"));

check("web startup warning hook", webConfig.includes("warnIfSupabasePublicEnvMissing"));

const sampleEnv = {
  [SupabaseEnvKeys.DATABASE_URL]:
    "postgresql://postgres.ref:pass@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
  [SupabaseEnvKeys.DIRECT_URL]:
    "postgresql://postgres.ref:pass@aws-1-eu-west-2.pooler.supabase.com:5432/postgres",
  [SupabaseEnvKeys.SUPABASE_URL]: "https://ref.supabase.co",
  [SupabaseEnvKeys.SUPABASE_ANON_KEY]: "anon-key-test",
  [SupabaseEnvKeys.SUPABASE_SERVICE_ROLE_KEY]: "service-role-test",
  [SupabaseEnvKeys.SITE_URL]: NEBULA_PRODUCTION_SITE_URL,
  [SupabaseEnvKeys.AUTH_REDIRECT_URL]: NEBULA_PRODUCTION_AUTH_CALLBACK,
  [SupabaseEnvKeys.STORAGE_BUCKET]: DEFAULT_SUPABASE_STORAGE_BUCKET,
};

const serverConfig = getSupabaseServerConfig(sampleEnv);
check("server config parses sample env", serverConfig.url === "https://ref.supabase.co");
check("server config storage bucket", serverConfig.storageBucket === "uploads");

const publicConfig = getSupabasePublicConfig(sampleEnv);
check("public config parses sample env", publicConfig?.anonKey === "anon-key-test");

const health = getSupabaseEnvHealth(sampleEnv);
check("env health configured", health.configured);
check("env health database", health.database);
check("env health auth", health.auth);
check("env health storage", health.storage);
check("env health realtime", health.realtime);

check("production domain check", isProductionDomainConfigured(sampleEnv));

check(
  "invalid URL rejected",
  (() => {
    try {
      getSupabaseServerConfig({
        ...sampleEnv,
        [SupabaseEnvKeys.DATABASE_URL]: "not-a-url",
      });
      return false;
    } catch {
      return true;
    }
  })()
);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
