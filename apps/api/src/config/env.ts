import path from "path";
import { config } from "dotenv";
import { z } from "zod";
import {
  DEFAULT_SUPABASE_STORAGE_BUCKET,
  NEBULA_PRODUCTION_AUTH_CALLBACK,
  NEBULA_PRODUCTION_SITE_URL,
  SupabaseEnvKeys,
  getSupabaseServerConfig,
} from "@nebula/shared";

config({ path: path.resolve(process.cwd(), "../../.env"), override: true });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default(NEBULA_PRODUCTION_SITE_URL),
  SUPABASE_AUTH_REDIRECT_URL: z
    .string()
    .url()
    .default(NEBULA_PRODUCTION_AUTH_CALLBACK),
  SUPABASE_STORAGE_BUCKET: z
    .string()
    .min(1)
    .default(DEFAULT_SUPABASE_STORAGE_BUCKET),
  SUPABASE_AUTH_GOOGLE_ENABLED: z.enum(["true", "false"]).default("false"),
  SUPABASE_AUTH_GITHUB_ENABLED: z.enum(["true", "false"]).default("false"),
  JWT_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  LLM_PROVIDER: z.enum(["anthropic", "deepseek"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().default(""),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-20250514"),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  E2B_API_KEY: z.string().default(""),
  E2B_PREVIEW_TEMPLATE: z.string().default("nebula-nextjs-prisma"),
  PREVIEW_TTL_MS: z.coerce.number().default(2 * 60 * 60 * 1000),
  PREVIEW_SANDBOX_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
  PREVIEW_RECONCILE_INTERVAL_MS: z.coerce.number().default(60_000),
  PREVIEW_MAX_PER_USER: z.coerce.number().default(2),
  PREVIEW_COST_USD_PER_HOUR: z.coerce.number().default(0.1),
  ADMIN_EMAILS: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GITHUB_OAUTH_CALLBACK_URL: z.string().url().optional(),
  GITHUB_TOKEN_ENCRYPTION_KEY: z.string().default(""),
  VERCEL_TOKEN: z.string().default(""),
  NETLIFY_TOKEN: z.string().default(""),
  UGAZON_DEPLOY_IP: z.string().default("185.158.133.1"),
  UGAZON_DEPLOY_DOMAIN: z.string().default("ugazon.dev"),
  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_REGISTER_PER_MIN: z.coerce.number().default(5),
  RATE_LIMIT_AI_PER_MIN: z.coerce.number().default(30),
  RATE_LIMIT_PREVIEW_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_GITHUB_PER_MIN: z.coerce.number().default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("\n  ");
  console.error(`[nebula] API environment validation failed:\n  ${missing}`);
  process.exit(1);
}

try {
  getSupabaseServerConfig(process.env);
} catch (err) {
  console.error(
    `[nebula] Supabase configuration failed: ${err instanceof Error ? err.message : err}`
  );
  process.exit(1);
}

export const env = parsed.data;

/** Typed Supabase accessors (re-export keys for discoverability). */
export { SupabaseEnvKeys };
