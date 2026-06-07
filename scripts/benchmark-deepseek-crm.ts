/**
 * DeepSeek CRM benchmark — exactly one project, DeepSeek provider only.
 */
import { PrismaClient } from "@prisma/client";
import { validateBuildReady, validateBuildQuality } from "@nebula/shared";
import type { AppSpec } from "@nebula/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 3000;

/** DeepSeek deepseek-chat list pricing (USD per 1M tokens, cache miss). */
const DEEPSEEK_INPUT_PER_M = 0.27;
const DEEPSEEK_OUTPUT_PER_M = 1.1;

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface PhaseMetrics {
  phase: string;
  toolCalls: number;
  durationSec: number;
}

interface BenchmarkResult {
  projectId: string;
  finalStatus: string;
  specJson: unknown;
  files: string[];
  pipelineDurationSec: number;
  buildDurationSec: number;
  clarifierTokensIn: number;
  clarifierTokensOut: number;
  builderTokensIn: number;
  builderTokensOut: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  toolCallCount: number;
  phaseMetrics: PhaseMetrics[];
  errorMessage?: string;
  failurePhase?: string;
  provider: string;
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

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * DEEPSEEK_INPUT_PER_M +
    (outputTokens / 1_000_000) * DEEPSEEK_OUTPUT_PER_M
  );
}

async function register(): Promise<string> {
  const email = `deepseek-crm-${Date.now()}@benchmark.test`;
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "DeepSeek Benchmark" }),
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

function buildPhaseMetrics(events: SseEvent[]): PhaseMetrics[] {
  const phaseOrder: string[] = [];
  const phaseStart = new Map<string, number>();
  const phaseTools = new Map<string, number>();
  const phaseEnd = new Map<string, number>();

  for (const e of events) {
    if (e.type === "progress" && e.data.step === "build_phase" && typeof e.data.phase === "string") {
      const phase = e.data.phase;
      if (!phaseStart.has(phase)) {
        phaseOrder.push(phase);
        phaseStart.set(phase, Date.parse(e.timestamp) || Date.now());
      }
      phaseEnd.set(phase, Date.parse(e.timestamp) || Date.now());
    }
    if (e.type === "agent.progress" && typeof e.data.phase === "string") {
      const phase = e.data.phase;
      phaseTools.set(phase, (phaseTools.get(phase) ?? 0) + 1);
      phaseEnd.set(phase, Date.parse(e.timestamp) || Date.now());
    }
  }

  return phaseOrder.map((phase) => {
    const start = phaseStart.get(phase) ?? 0;
    const end = phaseEnd.get(phase) ?? start;
    return {
      phase,
      toolCalls: phaseTools.get(phase) ?? 0,
      durationSec: Math.max(0, (end - start) / 1000),
    };
  });
}

async function waitForTerminal(
  projectId: string,
  token: string,
  timeoutMs: number
): Promise<{ status: string; specJson: unknown }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const project = await parseJson(res);

    if (project.status === "clarifying") {
      await fetch(`${API}/projects/${projectId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content:
            "Use reasonable defaults. Sales team CRM with contacts, companies, deals, and a dashboard. Next.js, Prisma, Tailwind. Proceed with the build.",
        }),
      });
    }

    if (project.status === "ready" || project.status === "failed") {
      return { status: project.status, specJson: project.specJson };
    }
    await sleep(POLL_MS);
  }
  throw new Error("Build timeout");
}

async function runBenchmark(prisma: PrismaClient, token: string): Promise<BenchmarkResult> {
  const sseEvents: SseEvent[] = [];
  let toolCallCount = 0;
  const pipelineStart = Date.now();
  let buildStartedAt = 0;
  let buildEndedAt = 0;

  const createRes = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "DeepSeek CRM Benchmark",
      prompt:
        "Build a simple CRM with contacts, companies, deals, and a dashboard",
    }),
  });
  const project = await parseJson(createRes);
  if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(project)}`);

  const projectId = project.id as string;
  console.log(`Project created: ${projectId}`);

  const stopSse = collectSse(projectId, token, (e) => {
    sseEvents.push(e);
    if (e.type === "agent.progress" && e.data.tool) toolCallCount++;
    if (e.type === "build.started" && buildStartedAt === 0) {
      buildStartedAt = Date.parse(e.timestamp) || Date.now();
    }
    if (e.type === "build.completed" || e.type === "build.failed") {
      buildEndedAt = Date.parse(e.timestamp) || Date.now();
    }
    if (["progress", "agent.progress", "build.started", "build.completed", "build.failed", "file.created"].includes(e.type)) {
      const detail =
        (e.data.message as string) ??
        (e.data.path as string) ??
        (e.data.tool as string) ??
        (e.data.phase as string) ??
        "";
      console.log(`  [${e.type}] ${detail}`);
    }
  });

  try {
    const { status, specJson } = await waitForTerminal(projectId, token, BUILD_TIMEOUT_MS);
    const pipelineEnd = Date.now();
    if (buildEndedAt === 0) buildEndedAt = pipelineEnd;
    if (buildStartedAt === 0) buildStartedAt = pipelineStart;

    const filesRes = await fetch(`${API}/projects/${projectId}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const filesBody = await parseJson(filesRes);
    const files = ((filesBody.data as Array<{ path: string }>) ?? []).map((f) => f.path).sort();

    const runs = await prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    let clarifierTokensIn = 0;
    let clarifierTokensOut = 0;
    let builderTokensIn = 0;
    let builderTokensOut = 0;
    let errorMessage: string | undefined;
    let failurePhase: string | undefined;

    for (const run of runs) {
      if (run.agentType === "clarifier") {
        clarifierTokensIn += run.tokensInput;
        clarifierTokensOut += run.tokensOutput;
      } else if (run.agentType === "builder") {
        builderTokensIn += run.tokensInput;
        builderTokensOut += run.tokensOutput;
        if (run.status === "failed") {
          errorMessage = run.errorMessage ?? errorMessage;
          failurePhase = run.failurePhase ?? failurePhase;
        }
      }
    }

    const dbToolCalls = runs
      .filter((r) => r.agentType === "builder")
      .reduce((sum, r) => sum + (r.toolCalls ?? 0), 0);

    return {
      projectId,
      finalStatus: status,
      specJson,
      files,
      pipelineDurationSec: (pipelineEnd - pipelineStart) / 1000,
      buildDurationSec: (buildEndedAt - buildStartedAt) / 1000,
      clarifierTokensIn,
      clarifierTokensOut,
      builderTokensIn,
      builderTokensOut,
      totalInputTokens: clarifierTokensIn + builderTokensIn,
      totalOutputTokens: clarifierTokensOut + builderTokensOut,
      totalTokens:
        clarifierTokensIn + clarifierTokensOut + builderTokensIn + builderTokensOut,
      toolCallCount: Math.max(toolCallCount, dbToolCalls),
      phaseMetrics: buildPhaseMetrics(sseEvents),
      errorMessage,
      failurePhase,
      provider: "deepseek",
    };
  } finally {
    stopSse();
  }
}

function printReport(result: BenchmarkResult, health: Record<string, unknown>) {
  const spec = result.specJson as AppSpec | null;
  const paths = result.files;
  const readyCheck = spec
    ? validateBuildReady({ paths, spec })
    : { ok: false, missing: ["spec unavailable"] };
  const qualityCheck = spec
    ? validateBuildQuality({ paths, spec })
    : { ok: false, missing: ["spec unavailable"] };

  const hasPackage = paths.includes("package.json");
  const hasPrisma = paths.some((p) => p === "prisma/schema.prisma");
  const hasLayout = paths.some((p) => p.endsWith("src/app/layout.tsx") || p === "src/app/layout.tsx");
  const hasPage = paths.some((p) => p.endsWith("src/app/page.tsx") || p === "src/app/page.tsx");
  const hasApiRoutes = paths.some((p) => p.includes("/api/") && p.endsWith("route.ts"));
  const hasComponents = paths.some((p) => p.includes("/components/"));
  const hasDashboard =
    paths.some((p) => p.toLowerCase().includes("dashboard")) ||
    paths.some((p) => p.includes("page.tsx") && p.includes("dashboard"));

  const cost = estimateCost(result.totalInputTokens, result.totalOutputTokens);

  console.log("\n# DeepSeek CRM Benchmark Report\n");
  console.log("## Summary\n");
  console.log(`Status: ${result.finalStatus}`);
  console.log(`Duration: ${result.pipelineDurationSec.toFixed(1)}s (pipeline) / ${result.buildDurationSec.toFixed(1)}s (build)`);
  console.log(`Files: ${paths.length}`);
  console.log(`Tool Calls: ${result.toolCallCount}`);
  console.log(
    `Tokens: ${result.totalInputTokens} in / ${result.totalOutputTokens} out (${result.totalTokens} total)`
  );
  console.log(`Estimated Cost: $${cost.toFixed(4)} USD`);
  console.log(`Provider (health): ${health.provider} configured=${health.configured}`);
  if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
  if (result.failurePhase) console.log(`Failure phase: ${result.failurePhase}`);

  console.log("\n## Ready Validation\n");
  console.log(`package.json exists: ${hasPackage ? "PASS" : "FAIL"}`);
  console.log(`prisma/schema.prisma exists: ${hasPrisma ? "PASS" : "FAIL"}`);
  console.log(`src/app/layout.tsx exists: ${hasLayout ? "PASS" : "FAIL"}`);
  console.log(`src/app/page.tsx exists: ${hasPage ? "PASS" : "FAIL"}`);
  console.log(`validateBuildReady: ${readyCheck.ok ? "PASS" : `FAIL — ${readyCheck.missing?.join(", ")}`}`);

  console.log("\n## Generated Files\n");
  for (const f of paths) console.log(f);

  console.log("\n## Phase Metrics\n");
  if (result.phaseMetrics.length === 0) {
    console.log("(no phase SSE events captured)");
  } else {
    for (const p of result.phaseMetrics) {
      console.log(`${p.phase}: ${p.toolCalls} tool calls, ${p.durationSec.toFixed(1)}s`);
    }
  }
  console.log(`Clarifier tokens: ${result.clarifierTokensIn} in / ${result.clarifierTokensOut} out`);
  console.log(`Builder tokens: ${result.builderTokensIn} in / ${result.builderTokensOut} out`);

  console.log("\n## Quality Assessment\n");
  console.log(`API routes generated: ${hasApiRoutes ? "yes" : "no"} (${paths.filter((p) => p.includes("/api/")).join(", ") || "none"})`);
  console.log(`Components generated: ${hasComponents ? "yes" : "no"}`);
  console.log(`Dashboard generated: ${hasDashboard ? "yes" : "no"}`);
  console.log(`validateBuildQuality: ${qualityCheck.ok ? "PASS" : `FAIL — ${qualityCheck.missing?.join(", ")}`}`);

  console.log("\n## Recommendation\n");
  if (result.finalStatus === "ready" && readyCheck.ok) {
    console.log(
      "DeepSeek completed the ready-first CRM build successfully. Ready-first architecture is validated for this provider."
    );
  } else if (result.finalStatus === "ready" && !readyCheck.ok) {
    console.log(
      "Project marked ready but ready validation failed — investigate missing required files before production use."
    );
  } else {
    console.log(
      `Build failed${result.failurePhase ? ` at phase ${result.failurePhase}` : ""}. Review tool-call limits, write_files parsing, and DeepSeek tool-call reliability before broader rollout.`
    );
  }
}

async function main() {
  console.log("DeepSeek CRM Benchmark");
  console.log("API:", API);

  const healthRes = await fetch(`${API}/health`);
  const health = (await parseJson(healthRes)) as Record<string, unknown>;

  if (health.provider !== "deepseek") {
    console.error(`ABORT: Active provider is "${health.provider}", expected deepseek.`);
    process.exit(1);
  }
  if (!health.configured) {
    console.error("ABORT: DeepSeek is not configured (DEEPSEEK_API_KEY missing).");
    process.exit(1);
  }

  const readyRes = await fetch(`${API}/health/ready`);
  const readyBody = await parseJson(readyRes);
  if (!readyRes.ok) {
    console.error("ABORT: Agent pipeline not ready:", JSON.stringify(readyBody));
    process.exit(1);
  }

  const token = await register();
  const prisma = new PrismaClient();

  try {
    const result = await runBenchmark(prisma, token);
    printReport(result, health);
    process.exit(result.finalStatus === "ready" ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
