/**
 * Phase 4B Build Analytics — static verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estimateLlmCostUsd } from "@nebula/shared";

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

console.log("Build Analytics Verification\n");

const schema = read("packages/database/prisma/schema.prisma");
const migration = read(
  "packages/database/prisma/migrations/20250608140000_build_analytics/migration.sql"
);
const analytics = read("apps/api/src/services/analytics.service.ts");
const agentRun = read("apps/api/src/services/agent-run.service.ts");
const builder = read("apps/api/src/services/builder.service.ts");

check("analytics_events table", schema.includes("model AnalyticsEvent"));
check("agent_runs llm_provider", schema.includes("llmProvider"));
check("agent_runs estimated_cost_usd", schema.includes("estimatedCostUsd"));
check("migration analytics_events", migration.includes("analytics_events"));

check("getBuildAnalytics", analytics.includes("getBuildAnalytics"));
check("tracks total builds", analytics.includes("totalBuilds"));
check("tracks success rate", analytics.includes("successRate"));
check("top failure codes", analytics.includes("topFailureCodes"));
check("top failure phases", analytics.includes("topFailurePhases"));
check("builds by provider", analytics.includes("buildsByProvider"));
check("workspace metrics", analytics.includes("workspaceMetrics"));

check("agent run stores provider", agentRun.includes("llmProvider"));
check("agent run stores cost", agentRun.includes("estimatedCostUsd"));
check("builder passes provider", builder.includes("getActiveLLMProviderId()"));

check("admin route", read("apps/api/src/routes/admin.routes.ts").includes("/admin/analytics/builds"));
check("admin middleware", read("apps/api/src/middleware/admin.ts").includes("ADMIN_EMAILS"));
check("admin UI page", read("apps/web/src/app/admin/analytics/page.tsx").includes("Build Analytics"));

check("cost estimate function", estimateLlmCostUsd("deepseek", 1000, 500) > 0);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
