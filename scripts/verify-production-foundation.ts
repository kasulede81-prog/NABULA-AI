/**
 * Phase 5 Production Foundation — static + unit verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NonRetryableErrorCodes,
  SseEvents,
} from "@nebula/shared";
import {
  isBuildLimitReached,
  isUnlimitedBuildPlan,
} from "../apps/api/src/services/subscription.service";

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

console.log("Production Foundation Verification\n");

const schema = read("packages/database/prisma/schema.prisma");
const buildService = read("apps/api/src/services/build.service.ts");
const subscription = read("apps/api/src/services/subscription.service.ts");
const preview = read("apps/api/src/services/preview.service.ts");
const lifecycle = read("apps/api/src/services/preview-lifecycle.service.ts");
const analytics = read("apps/api/src/services/analytics.service.ts");
const envTs = read("apps/api/src/config/env.ts");
const indexTs = read("apps/api/src/index.ts");
const envExample = read(".env.example");
const previewMigration = read(
  "packages/database/prisma/migrations/20250609120000_preview_lifecycle/migration.sql"
);

check("schema directUrl for Supabase", schema.includes("directUrl = env(\"DIRECT_URL\")"));
check("preview startedAt field", schema.includes("startedAt"));
check("preview estimatedCostUsd field", schema.includes("estimatedCostUsd"));
check("preview status+expiresAt index", schema.includes("@@index([status, expiresAt])"));
check("preview lifecycle migration", previewMigration.includes("started_at"));

check("DIRECT_URL in env example", envExample.includes("DIRECT_URL"));
check("Supabase pooler docs in env example", envExample.includes("pgbouncer=true"));
check("PREVIEW_RECONCILE_INTERVAL_MS env", envTs.includes("PREVIEW_RECONCILE_INTERVAL_MS"));
check("PREVIEW_MAX_PER_USER env", envTs.includes("PREVIEW_MAX_PER_USER"));
check("PREVIEW_COST_USD_PER_HOUR env", envTs.includes("PREVIEW_COST_USD_PER_HOUR"));

check("BUILD_LIMIT_REACHED error code", NonRetryableErrorCodes.BUILD_LIMIT_REACHED === "BUILD_LIMIT_REACHED");
check("SSE build.limit_reached", SseEvents.BUILD_LIMIT_REACHED === "build.limit_reached");
check("SSE preview.expired", SseEvents.PREVIEW_EXPIRED === "preview.expired");

check("assertBuildAllowed in subscription service", subscription.includes("assertBuildAllowed"));
check("consumeBuildSlot in subscription service", subscription.includes("consumeBuildSlot"));
check("pro unlimited builds", subscription.includes('plan === "pro"'));
check("build limit before clarifier", buildService.includes("assertBuildAllowed"));
check("consume slot before builder", buildService.includes("consumeBuildSlot"));
check("handleBuildLimitReached", buildService.includes("handleBuildLimitReached"));
check("assistant limit message", buildService.includes("You have reached your monthly build limit."));
check("SSE build limit publish", buildService.includes("SseEvents.BUILD_LIMIT_REACHED"));
check("analytics build_limit_reached", analytics.includes("BUILD_LIMIT_REACHED"));

check("preview concurrency limit", preview.includes("PREVIEW_MAX_PER_USER"));
check("E2B check before 202", preview.includes("E2B_NOT_CONFIGURED"));
check("preview forceStop", preview.includes("forceStop"));
check("preview cost estimate", preview.includes("estimatePreviewCostUsd"));
check("preview lifecycle service", lifecycle.includes("reconcileExpiredPreviews"));
check("orphan reconciliation", lifecycle.includes("reconcileOrphanedPreviews"));
check("preview health monitoring", lifecycle.includes("monitorPreviewHealth"));
check("lifecycle started on boot", indexTs.includes("previewLifecycleService.start()"));

check("analytics preview cost events", analytics.includes("PREVIEW_EXPIRED"));
check("analytics preview_stopped", analytics.includes("PREVIEW_STOPPED"));

check("free user blocked at limit", isBuildLimitReached("free", 3, 3));
check("free user allowed under limit", !isBuildLimitReached("free", 2, 3));
check("pro user continues at limit", !isBuildLimitReached("pro", 100, 3));
check("pro is unlimited plan", isUnlimitedBuildPlan("pro"));
check("preview cost formula uses hourly rate", preview.includes("PREVIEW_COST_USD_PER_HOUR"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
