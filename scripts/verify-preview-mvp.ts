/**
 * Phase 3 Preview MVP — static verification (no E2B API calls).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SseEvents, validateBuildReady } from "@nebula/shared";
import type { AppSpec } from "@nebula/shared";

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

console.log("Preview MVP Verification\n");

// --- Files exist ---
check("preview.service.ts exists", read("apps/api/src/services/preview.service.ts").includes("class PreviewService"));
check("preview.routes.ts exists", read("apps/api/src/routes/preview.routes.ts").includes("previewRoutes"));
check("PreviewPanel.tsx exists", read("apps/web/src/components/workspace/PreviewPanel.tsx").includes("PreviewPanel"));
check("vfs snapshot method", read("apps/api/src/services/vfs.service.ts").includes("async snapshot("));

// --- API routes ---
const routes = read("apps/api/src/routes/preview.routes.ts");
check("POST preview route", routes.includes('post("/projects/:projectId/preview"'));
check("GET preview route", routes.includes('get("/projects/:projectId/preview"'));
check("DELETE preview route", routes.includes('delete("/projects/:projectId/preview"'));
check("routes registered in app.ts", read("apps/api/src/app.ts").includes("previewRoutes"));

// --- SSE events ---
check("preview.started event", SseEvents.PREVIEW_STARTED === "preview.started");
check("preview.ready event", SseEvents.PREVIEW_READY === "preview.ready");
check("preview.failed event", SseEvents.PREVIEW_FAILED === "preview.failed");
check("preview.deleted event", SseEvents.PREVIEW_DELETED === "preview.deleted");

const previewService = read("apps/api/src/services/preview.service.ts");
check("publishes PREVIEW_STARTED", previewService.includes("SseEvents.PREVIEW_STARTED"));
check("publishes PREVIEW_READY", previewService.includes("SseEvents.PREVIEW_READY"));
check("publishes PREVIEW_FAILED", previewService.includes("SseEvents.PREVIEW_FAILED"));
check("publishes PREVIEW_DELETED", previewService.includes("SseEvents.PREVIEW_DELETED"));

// --- E2B integration ---
check("uses E2B Sandbox", previewService.includes('from "e2b"'));
check("writes VFS files to sandbox", previewService.includes("sandbox.files.write"));
check("uses E2B preview template", previewService.includes("template: env.E2B_PREVIEW_TEMPLATE"));
check("getHost for preview URL", previewService.includes("getHost"));

// --- Validation ---
check("requires status ready", previewService.includes('project.status !== "ready"'));
check("uses validateBuildReady", previewService.includes("validateBuildReady"));

const crmSpec: AppSpec = {
  appType: "CRM",
  name: "CRM",
  description: "CRM",
  features: ["contacts"],
  stack: "nextjs-prisma-tailwind",
};
const readyPaths = [
  "package.json",
  "prisma/schema.prisma",
  "src/app/layout.tsx",
  "src/app/page.tsx",
];
check("validateBuildReady passes with required files", validateBuildReady({ paths: readyPaths, spec: crmSpec }).ok);
check(
  "validateBuildReady fails without page.tsx",
  !validateBuildReady({ paths: readyPaths.filter((p) => p !== "src/app/page.tsx"), spec: crmSpec }).ok
);

// --- No auto-deploy ---
const builder = read("apps/api/src/services/builder.service.ts");
check("builder does not auto-start preview", !builder.includes("previewService"));

// --- Env ---
const env = read("apps/api/src/config/env.ts");
check("E2B_API_KEY in env schema", env.includes("E2B_API_KEY"));
check(".env.example documents E2B", read(".env.example").includes("E2B_API_KEY"));

// --- Web API client ---
const apiClient = read("apps/web/src/lib/api.ts");
check("getPreview client", apiClient.includes("getPreview"));
check("startPreview client", apiClient.includes("startPreview"));
check("deletePreview client", apiClient.includes("deletePreview"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
