/**
 * Phase 2 optimization validation — runs 3 projects and compares vs baseline metrics.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 3000;

interface ProjectTest {
  name: string;
  prompt: string;
}

const PROJECTS: ProjectTest[] = [
  { name: "Simple CRM", prompt: "Build a simple CRM" },
  { name: "Task Manager", prompt: "Build a task manager" },
  { name: "Restaurant POS", prompt: "Build a restaurant POS" },
];

/** Baseline from Phase 2 final validation (pre-optimization). */
const BASELINE: Record<
  string,
  {
    files: number;
    durationSec: number;
    tokens: number;
    toolCalls: number;
    status: string;
    hasPage: boolean;
  }
> = {
  "Simple CRM": {
    files: 29,
    durationSec: 524,
    tokens: 313107,
    toolCalls: 30,
    status: "ready",
    hasPage: true,
  },
  "Task Manager": {
    files: 22,
    durationSec: 489,
    tokens: 237672,
    toolCalls: 23,
    status: "failed",
    hasPage: false,
  },
  "Restaurant POS": {
    files: 29,
    durationSec: 548,
    tokens: 302641,
    toolCalls: 30,
    status: "ready",
    hasPage: false,
  },
};

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface TestResult {
  name: string;
  projectId: string;
  specJson: unknown;
  fileCount: number;
  files: string[];
  hasPage: boolean;
  buildDurationMs: number;
  clarifierTokensIn: number;
  clarifierTokensOut: number;
  builderTokensIn: number;
  builderTokensOut: number;
  totalTokens: number;
  toolCallCount: number;
  retryCount: number;
  finalStatus: string;
  sseEvents: SseEvent[];
  error?: string;
  dbToolCalls?: number | null;
  dbFilesGenerated?: number | null;
  dbBuildDurationMs?: number | null;
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function register(): Promise<string> {
  const email = `opt-val-${Date.now()}@test.com`;
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "Optimization Validator" }),
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

async function waitForStatus(
  projectId: string,
  token: string,
  targets: string[],
  timeoutMs: number
): Promise<{ status: string; specJson: unknown }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const project = await parseJson(res);
    if (targets.includes(project.status)) {
      return { status: project.status, specJson: project.specJson };
    }
    if (project.status === "failed") {
      return { status: "failed", specJson: project.specJson };
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Timeout waiting for status ${targets.join("|")}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runProject(
  prisma: PrismaClient,
  token: string,
  test: ProjectTest
): Promise<TestResult> {
  const sseEvents: SseEvent[] = [];
  let toolCallCount = 0;
  let retryCount = 0;
  let buildStartedAt = 0;
  let buildEndedAt = 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PROJECT: ${test.name}`);
  console.log(`Prompt: ${test.prompt}`);
  console.log("=".repeat(60));

  const createRes = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: test.name, prompt: test.prompt }),
  });
  const project = await parseJson(createRes);
  if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(project)}`);

  const projectId = project.id as string;
  console.log(`Created project ${projectId}`);

  const stopSse = collectSse(projectId, token, (e) => {
    sseEvents.push(e);
    if (e.type === "agent.progress" && e.data.tool) {
      toolCallCount++;
    }
    if (e.type === "build.started") {
      if (buildStartedAt === 0) buildStartedAt = Date.now();
      const attempt = (e.data.attempt as number) ?? 1;
      if (attempt > 1) retryCount++;
    }
    if (e.type === "build.completed" || e.type === "build.failed") {
      buildEndedAt = Date.now();
    }
    if (
      ["agent.progress", "build.started", "build.completed", "file.created", "agent.completed"].includes(
        e.type
      )
    ) {
      const detail =
        (e.data.message as string) ??
        (e.data.path as string) ??
        (e.data.tool as string) ??
        JSON.stringify(e.data).slice(0, 80);
      console.log(`  SSE [${e.type}] ${detail}`);
    }
  });

  try {
    const { status, specJson } = await waitForStatus(
      projectId,
      token,
      ["ready", "failed"],
      BUILD_TIMEOUT_MS
    );

    if (buildEndedAt === 0) buildEndedAt = Date.now();
    if (buildStartedAt === 0) buildStartedAt = buildEndedAt;

    const filesRes = await fetch(`${API}/projects/${projectId}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const filesBody = await parseJson(filesRes);
    const files = ((filesBody.data as Array<{ path: string }>) ?? []).map((f) => f.path);
    const hasPage = files.some((f) => f.endsWith("page.tsx"));

    const runs = await prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    let clarifierTokensIn = 0;
    let clarifierTokensOut = 0;
    let builderTokensIn = 0;
    let builderTokensOut = 0;
    let dbToolCalls = 0;
    let dbFilesGenerated: number | null = null;
    let dbBuildDurationMs = 0;

    for (const run of runs) {
      if (run.agentType === "clarifier") {
        clarifierTokensIn += run.tokensInput;
        clarifierTokensOut += run.tokensOutput;
      } else if (run.agentType === "builder") {
        builderTokensIn += run.tokensInput;
        builderTokensOut += run.tokensOutput;
        dbToolCalls += run.toolCalls ?? 0;
        dbBuildDurationMs += run.buildDurationMs ?? 0;
        if (run.filesGenerated != null) dbFilesGenerated = run.filesGenerated;
      }
    }

    const result: TestResult = {
      name: test.name,
      projectId,
      specJson,
      fileCount: files.length,
      files,
      hasPage,
      buildDurationMs:
        dbBuildDurationMs > 0 ? dbBuildDurationMs : buildEndedAt - buildStartedAt,
      clarifierTokensIn,
      clarifierTokensOut,
      builderTokensIn,
      builderTokensOut,
      totalTokens:
        clarifierTokensIn + clarifierTokensOut + builderTokensIn + builderTokensOut,
      toolCallCount: dbToolCalls > 0 ? dbToolCalls : toolCallCount,
      retryCount,
      finalStatus: status,
      sseEvents,
      dbToolCalls,
      dbFilesGenerated,
      dbBuildDurationMs,
      error: status === "failed" ? "Build failed" : undefined,
    };

    console.log(
      `\nResult: ${status} | files=${files.length} | page=${hasPage} | tools=${result.toolCallCount} | retries=${retryCount}`
    );
    console.log(
      `Tokens: clarifier ${clarifierTokensIn}/${clarifierTokensOut} builder ${builderTokensIn}/${builderTokensOut} total=${result.totalTokens}`
    );
    console.log(`Duration: ${(result.buildDurationMs / 1000).toFixed(1)}s`);

    return result;
  } finally {
    stopSse();
  }
}

function pctChange(oldVal: number, newVal: number): string {
  if (oldVal === 0) return "n/a";
  const pct = ((newVal - oldVal) / oldVal) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function printComparison(results: TestResult[]) {
  console.log("\n\n" + "=".repeat(70));
  console.log("OPTIMIZATION COMPARISON — OLD vs NEW");
  console.log("=".repeat(70));

  console.log(
    "\n| Project | Metric | Baseline | Optimized | Change |"
  );
  console.log("|---------|--------|----------|-----------|--------|");

  let readyCount = 0;
  let readyWithPage = 0;
  let totalBaselineTokens = 0;
  let totalNewTokens = 0;
  let totalBaselineDuration = 0;
  let totalNewDuration = 0;

  for (const r of results) {
    const base = BASELINE[r.name];
    if (!base) continue;

    const durationSec = r.buildDurationMs / 1000;
    const metrics: Array<[string, number, number]> = [
      ["Files", base.files, r.fileCount],
      ["Duration(s)", base.durationSec, durationSec],
      ["Tokens", base.tokens, r.totalTokens],
      ["Tool calls", base.toolCalls, r.toolCallCount],
    ];

    for (const [label, old, neu] of metrics) {
      console.log(
        `| ${r.name} | ${label} | ${old} | ${Math.round(neu)} | ${pctChange(old, neu)} |`
      );
    }
    console.log(
      `| ${r.name} | Status | ${base.status} | ${r.finalStatus} | ${base.status === r.finalStatus ? "=" : "changed"} |`
    );
    console.log(
      `| ${r.name} | Has page.tsx | ${base.hasPage} | ${r.hasPage} | ${base.hasPage === r.hasPage ? "=" : "changed"} |`
    );

    if (r.finalStatus === "ready") readyCount++;
    if (r.finalStatus === "ready" && r.hasPage) readyWithPage++;

    totalBaselineTokens += base.tokens;
    totalNewTokens += r.totalTokens;
    totalBaselineDuration += base.durationSec;
    totalNewDuration += durationSec;
  }

  const successRate = (readyCount / results.length) * 100;
  const tokenReduction = ((totalBaselineTokens - totalNewTokens) / totalBaselineTokens) * 100;
  const durationReduction =
    ((totalBaselineDuration - totalNewDuration) / totalBaselineDuration) * 100;

  console.log("\n" + "=".repeat(70));
  console.log("GOALS");
  console.log("=".repeat(70));
  console.log(
    `1. Token reduction ≥50%:  ${tokenReduction.toFixed(0)}% ${tokenReduction >= 50 ? "PASS" : "FAIL"} (baseline ${totalBaselineTokens} → ${totalNewTokens})`
  );
  console.log(
    `2. Build duration <3 min:   avg ${(totalNewDuration / results.length / 60).toFixed(1)} min per project ${totalNewDuration / results.length < 180 ? "PASS" : "FAIL"}`
  );
  console.log(
    `3. Success rate >90%:      ${successRate.toFixed(0)}% (${readyCount}/${results.length}) ${successRate > 90 ? "PASS" : "FAIL"}`
  );
  console.log(
    `4. page.tsx on success:    ${readyWithPage}/${readyCount} ready builds have page.tsx ${readyCount === 0 || readyWithPage === readyCount ? "PASS" : "FAIL"}`
  );
  console.log(
    `\nAggregate duration reduction: ${durationReduction.toFixed(0)}% (${totalBaselineDuration}s → ${totalNewDuration.toFixed(0)}s)`
  );
}

async function main() {
  console.log("Phase 2 Optimization Validation");
  console.log("API:", API);

  const ready = await fetch(`${API}/health/ready`);
  const readyBody = await parseJson(ready);
  console.log("Ready:", ready.status, JSON.stringify(readyBody));

  if (!ready.ok) {
    console.error("Agent pipeline not ready. Aborting.");
    process.exit(1);
  }

  const token = await register();
  const prisma = new PrismaClient();
  const results: TestResult[] = [];

  try {
    for (const test of PROJECTS) {
      try {
        results.push(await runProject(prisma, token, test));
      } catch (err) {
        console.error(`FAILED ${test.name}:`, err);
        results.push({
          name: test.name,
          projectId: "",
          specJson: null,
          fileCount: 0,
          files: [],
          hasPage: false,
          buildDurationMs: 0,
          clarifierTokensIn: 0,
          clarifierTokensOut: 0,
          builderTokensIn: 0,
          builderTokensOut: 0,
          totalTokens: 0,
          toolCallCount: 0,
          retryCount: 0,
          finalStatus: "error",
          sseEvents: [],
          error: String(err),
        });
      }
    }

    printComparison(results);

    const allReady = results.every((r) => r.finalStatus === "ready");
    const allHavePage = results
      .filter((r) => r.finalStatus === "ready")
      .every((r) => r.hasPage);

    process.exit(allReady && allHavePage ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
