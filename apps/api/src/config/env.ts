import path from "path";
import { config } from "dotenv";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), "../../.env"), override: true });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
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
});

export const env = envSchema.parse(process.env);
