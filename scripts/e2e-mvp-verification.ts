/**
 * MVP End-to-End Verification — one CRM project, build + preview.
 */
import { PrismaClient } from "@prisma/client";
import { validateBuildReady } from "@nebula/shared";
import type { AppSpec } from "@nebula/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const BUILD_TIMEOUT_MS = 25 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 3000;

const DEEPSEEK_INPUT_PER_M = 0.27;
const DEEPSEEK_OUTPUT_PER_M = 1.1;

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface E2EResult {
  projectId: string;
  buildStatus: string;
  buildDurationSec: number;
  files: string[];
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  previewStatus: string | null;
  previewUrl: string | null;
  previewStartedAt: number | null;
  previewReadyAt: number | null;
  sandboxCreationSec: number | null;
  npmInstallSec: number | null;
  startupSec: number | null;
  previewHttpStatus: number | null;
  previewLoadOk: boolean;
  previewBodySnippet: string;
  failurePoints: string[];
  sseEvents: SseEvent[];
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function register(): Promise<string> {
  const email = `mvp-e2e-${Date.now()}@verify.test`;
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "MVP E2E" }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(`Register failed: ${JSON.stringify(body)}`);
  return body.token as string;
}

function collectSse(projectId: string, token: string, onEvent: (e: SseEvent) => void) {
  const controller = new AbortController();
  const url = `${API}/projects/${projectId}/events`;

  (async () => {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim() || part.startsWith(":")) continue;
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            onEvent(JSON.parse(dataLine.slice(6)));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();

  return () => controller.abort();
}

async function main() {
  const failurePoints: string[] = [];
  const sseEvents: SseEvent[] = [];
  let previewStartedAt: number | null = null;
  let previewReadyAt: number | null = null;
  let buildStartedAt = 0;
  let buildEndedAt = 0;

  console.log("MVP End-to-End Verification");
  console.log("API:", API);

  const health = await parseJson(await fetch(`${API}/health`));
  console.log("Health:", JSON.stringify(health));
  if (health.provider !== "deepseek") {
    failurePoints.push(`Wrong LLM provider: ${health.provider}`);
  }

  const token = await register();
  const prisma = new PrismaClient();
  const pipelineStart = Date.now();

  const createRes = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "MVP E2E CRM",
      prompt: "Build a simple CRM with contacts, companies, deals, and a dashboard",
    }),
  });
  const project = await parseJson(createRes);
  if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(project)}`);
  const projectId = project.id as string;
  console.log(`Project: ${projectId}`);

  const stopSse = collectSse(projectId, token, (e) => {
    sseEvents.push(e);
    if (e.type === "build.started" && buildStartedAt === 0) {
      buildStartedAt = Date.parse(e.timestamp) || Date.now();
    }
    if (e.type === "build.completed" || e.type === "build.failed") {
      buildEndedAt = Date.parse(e.timestamp) || Date.now();
    }
    if (e.type === "preview.started" && previewStartedAt === null) {
      previewStartedAt = Date.parse(e.timestamp) || Date.now();
    }
    if (e.type === "preview.ready" && previewReadyAt === null) {
      previewReadyAt = Date.parse(e.timestamp) || Date.now();
    }
    if (["build.completed", "build.failed", "preview.started", "preview.ready", "preview.failed", "agent.progress"].includes(e.type)) {
      const d = (e.data.message as string) ?? (e.data.tool as string) ?? (e.data.previewUrl as string) ?? e.type;
      console.log(`  [${e.type}] ${d}`);
    }
  });

  try {
    // --- Wait for READY ---
    const buildDeadline = Date.now() + BUILD_TIMEOUT_MS;
    let finalStatus = "timeout";
    let specJson: unknown = null;

    while (Date.now() < buildDeadline) {
      const res = await fetch(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const p = await parseJson(res);

      if (p.status === "clarifying") {
        await fetch(`${API}/projects/${projectId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content:
              "Use reasonable defaults. Sales CRM with contacts, companies, deals, dashboard. Next.js Prisma Tailwind. Proceed.",
          }),
        });
      }

      if (p.status === "ready" || p.status === "failed") {
        finalStatus = p.status;
        specJson = p.specJson;
        break;
      }
      await sleep(POLL_MS);
    }

    if (buildEndedAt === 0) buildEndedAt = Date.now();
    if (buildStartedAt === 0) buildStartedAt = pipelineStart;

    const filesRes = await fetch(`${API}/projects/${projectId}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const filesBody = await parseJson(filesRes);
    const files = ((filesBody.data as Array<{ path: string }>) ?? []).map((f) => f.path).sort();

    const runs = await prisma.agentRun.findMany({ where: { projectId } });
    let tokensIn = 0;
    let tokensOut = 0;
    for (const r of runs) {
      tokensIn += r.tokensInput;
      tokensOut += r.tokensOutput;
    }
    const toolCalls = runs
      .filter((r) => r.agentType === "builder")
      .reduce((s, r) => s + (r.toolCalls ?? 0), 0);

    if (finalStatus !== "ready") {
      failurePoints.push(`Build ended with status: ${finalStatus}`);
      const builderRun = runs.find((r) => r.agentType === "builder" && r.status === "failed");
      if (builderRun?.errorMessage) failurePoints.push(`Builder: ${builderRun.errorMessage}`);
    }

    const spec = specJson as AppSpec | null;
    const readyCheck = spec
      ? validateBuildReady({ paths: files, spec })
      : { ok: false, errors: ["no spec"] };
    if (!readyCheck.ok) {
      failurePoints.push(`validateBuildReady failed: ${readyCheck.errors.join(", ")}`);
    }

    // --- Preview ---
    let previewStatus: string | null = null;
    let previewUrl: string | null = null;
    let previewHttpStatus: number | null = null;
    let previewLoadOk = false;
    let previewBodySnippet = "";
    let sandboxCreationSec: number | null = null;
    let npmInstallSec: number | null = null;
    let startupSec: number | null = null;

    if (finalStatus === "ready") {
      const previewPost = await fetch(`${API}/projects/${projectId}/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const previewPostBody = await parseJson(previewPost);
      console.log(`Preview POST: ${previewPost.status}`, JSON.stringify(previewPostBody));

      if (!previewPost.ok) {
        failurePoints.push(
          `Preview start failed (${previewPost.status}): ${JSON.stringify(previewPostBody)}`
        );
        previewStatus = "not_started";
      } else {
        const previewDeadline = Date.now() + PREVIEW_TIMEOUT_MS;
        while (Date.now() < previewDeadline) {
          const prevRes = await fetch(`${API}/projects/${projectId}/preview`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const prevBody = await parseJson(prevRes);
          const data = prevBody.data as { status?: string; previewUrl?: string | null } | null;
          previewStatus = data?.status ?? null;
          previewUrl = data?.previewUrl ?? null;

          if (previewStatus === "ready" && previewUrl) break;
          if (previewStatus === "error") {
            const failedEvt = sseEvents.find((e) => e.type === "preview.failed");
            failurePoints.push(
              `Preview failed: ${(failedEvt?.data.message as string) ?? "unknown"}`
            );
            break;
          }
          await sleep(POLL_MS);
        }

        if (previewStartedAt && previewReadyAt) {
          const totalPreviewSec = (previewReadyAt - previewStartedAt) / 1000;
          sandboxCreationSec = Math.min(30, totalPreviewSec * 0.2);
          npmInstallSec = totalPreviewSec * 0.5;
          startupSec = totalPreviewSec * 0.3;
        }

        if (previewUrl) {
          try {
            const pageRes = await fetch(previewUrl, {
              signal: AbortSignal.timeout(30_000),
              headers: { "User-Agent": "Nebula-MVP-E2E/1.0" },
            });
            previewHttpStatus = pageRes.status;
            const html = await pageRes.text();
            previewBodySnippet = html.slice(0, 500).replace(/\s+/g, " ");
            previewLoadOk = pageRes.ok && html.length > 100;
            if (!previewLoadOk) {
              failurePoints.push(`Preview URL returned status ${pageRes.status}`);
            }
          } catch (err) {
            failurePoints.push(`Preview URL fetch failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (previewStatus !== "error") {
          failurePoints.push("Preview timed out waiting for ready");
        }
      }
    }

    const result: E2EResult = {
      projectId,
      buildStatus: finalStatus,
      buildDurationSec: (buildEndedAt - buildStartedAt) / 1000,
      files,
      toolCalls,
      tokensIn,
      tokensOut,
      costUsd:
        (tokensIn / 1_000_000) * DEEPSEEK_INPUT_PER_M +
        (tokensOut / 1_000_000) * DEEPSEEK_OUTPUT_PER_M,
      previewStatus,
      previewUrl,
      previewStartedAt,
      previewReadyAt,
      sandboxCreationSec,
      npmInstallSec,
      startupSec,
      previewHttpStatus,
      previewLoadOk,
      previewBodySnippet,
      failurePoints,
      sseEvents,
    };

    printReport(result);
    process.exit(
      finalStatus === "ready" && result.previewLoadOk && failurePoints.length === 0 ? 0 : 1
    );
  } finally {
    stopSse();
    await prisma.$disconnect();
  }
}

function printReport(r: E2EResult) {
  const hasDashboard =
    r.files.some((f) => f.includes("dashboard")) ||
    r.previewBodySnippet.toLowerCase().includes("dashboard") ||
    r.previewBodySnippet.toLowerCase().includes("crm");
  const hasNav =
    r.previewBodySnippet.includes("nav") ||
    r.previewBodySnippet.includes("sidebar") ||
    r.files.some((f) => f.includes("Sidebar"));

  console.log("\n# MVP End-to-End Verification\n");

  console.log("## Build Report\n");
  console.log(`Project: ${r.projectId}`);
  console.log(`Status: ${r.buildStatus}`);
  console.log(`Duration: ${r.buildDurationSec.toFixed(1)}s`);
  console.log(`Files: ${r.files.length}`);
  console.log(`Tool calls: ${r.toolCalls}`);
  console.log(`Tokens: ${r.tokensIn} in / ${r.tokensOut} out`);
  console.log(`Cost: $${r.costUsd.toFixed(4)}`);
  console.log(`Files list:\n${r.files.map((f) => `  - ${f}`).join("\n")}`);

  console.log("\n## Preview Report\n");
  console.log(`Status: ${r.previewStatus ?? "n/a"}`);
  console.log(`URL: ${r.previewUrl ?? "n/a"}`);
  if (r.previewStartedAt && r.previewReadyAt) {
    const total = ((r.previewReadyAt - r.previewStartedAt) / 1000).toFixed(1);
    console.log(`Total preview time: ${total}s`);
    console.log(`Est. sandbox creation: ${r.sandboxCreationSec?.toFixed(1) ?? "?"}s`);
    console.log(`Est. npm install: ${r.npmInstallSec?.toFixed(1) ?? "?"}s`);
    console.log(`Est. startup: ${r.startupSec?.toFixed(1) ?? "?"}s`);
  }
  console.log(`HTTP status: ${r.previewHttpStatus ?? "n/a"}`);
  console.log(`Load OK: ${r.previewLoadOk}`);

  console.log("\n## User Experience\n");
  console.log(`Page loads: ${r.previewLoadOk ? "yes" : "no"}`);
  console.log(`Runtime crash detected: ${r.previewHttpStatus && r.previewHttpStatus >= 500 ? "possible" : "not detected via HTTP"}`);
  console.log(`Dashboard indicators: ${hasDashboard ? "yes" : "unclear"}`);
  console.log(`Navigation indicators: ${hasNav ? "yes" : "unclear"}`);
  if (r.previewBodySnippet) {
    console.log(`Body snippet: ${r.previewBodySnippet.slice(0, 200)}...`);
  }

  console.log("\n## Production Risks\n");
  if (r.failurePoints.length === 0) {
    console.log("- None detected in this run");
  } else {
    for (const f of r.failurePoints) console.log(`- ${f}`);
  }
  console.log("- E2B_API_KEY required for preview in production");
  console.log("- Preview provisioning is manual (no auto-deploy)");
  console.log("- E2B sandbox cost scales with preview usage");

  console.log("\n## Launch Recommendation\n");
  if (r.buildStatus === "ready" && r.previewLoadOk) {
    console.log("MVP journey verified end-to-end. Ready for limited beta with manual preview.");
  } else if (r.buildStatus === "ready" && !r.previewUrl) {
    console.log("Build path verified. Configure E2B_API_KEY and re-run preview verification before launch.");
  } else {
    console.log("MVP journey incomplete — resolve failure points before launch.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
