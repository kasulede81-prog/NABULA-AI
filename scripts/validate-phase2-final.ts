/**
 * Phase 2 final validation — runs 3 projects end-to-end with real Claude.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
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
  clarifierQuestions: boolean;
  error?: string;
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
  const email = `final-val-${Date.now()}@test.com`;
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "Final Validator" }),
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
    if (project.status === "clarifying") {
      // Auto-answer clarification to proceed
      await fetch(`${API}/projects/${projectId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content:
            "Use reasonable defaults. Sales team CRM with contacts, deals, and dashboard. Proceed with the build.",
        }),
      });
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
    if (["agent.progress", "build.started", "build.completed", "file.created", "agent.completed"].includes(e.type)) {
      const detail =
        (e.data.message as string) ??
        (e.data.path as string) ??
        (e.data.tool as string) ??
        JSON.stringify(e.data).slice(0, 80);
      console.log(`  SSE [${e.type}] ${detail}`);
    }
  });

  try {
    // Wait for pipeline: draft/clarifying → building → ready|failed
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

    const runs = await prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    let clarifierTokensIn = 0;
    let clarifierTokensOut = 0;
    let builderTokensIn = 0;
    let builderTokensOut = 0;

    for (const run of runs) {
      if (run.agentType === "clarifier") {
        clarifierTokensIn += run.tokensInput;
        clarifierTokensOut += run.tokensOutput;
      } else if (run.agentType === "builder") {
        builderTokensIn += run.tokensInput;
        builderTokensOut += run.tokensOutput;
      }
    }

    const messages = await prisma.message.findMany({
      where: { projectId, role: "assistant" },
      select: { content: true },
    });
    const clarifierQuestions = messages.some((m) =>
      m.content.includes("questions before I start")
    );

    const result: TestResult = {
      name: test.name,
      projectId,
      specJson,
      fileCount: files.length,
      files,
      buildDurationMs: buildEndedAt - buildStartedAt,
      clarifierTokensIn,
      clarifierTokensOut,
      builderTokensIn,
      builderTokensOut,
      totalTokens:
        clarifierTokensIn +
        clarifierTokensOut +
        builderTokensIn +
        builderTokensOut,
      toolCallCount,
      retryCount,
      finalStatus: status,
      sseEvents,
      clarifierQuestions,
      error: status === "failed" ? "Build failed" : undefined,
    };

    console.log(`\nResult: ${status} | files=${files.length} | tools=${toolCallCount} | retries=${retryCount}`);
    console.log(`Tokens: clarifier ${clarifierTokensIn}/${clarifierTokensOut} builder ${builderTokensIn}/${builderTokensOut}`);
    console.log(`Duration: ${(result.buildDurationMs / 1000).toFixed(1)}s`);

    return result;
  } finally {
    stopSse();
  }
}

function evaluateQuality(results: TestResult[]) {
  console.log("\n\n" + "=".repeat(60));
  console.log("QUALITY EVALUATION");
  console.log("=".repeat(60));

  for (const r of results) {
    console.log(`\n--- ${r.name} ---`);
    console.log(`Files (${r.fileCount}):`);
    r.files.sort().forEach((f) => console.log(`  ${f}`));

    const hasPackage = r.files.some((f) => f === "package.json");
    const hasPrisma = r.files.some((f) => f.includes("prisma/schema"));
    const hasLayout = r.files.some((f) => f.includes("layout.tsx"));
    const hasPage = r.files.some((f) => f.includes("page.tsx"));
    const hasComponents = r.files.some((f) => f.includes("components/"));

    console.log(`Structure: package=${hasPackage} prisma=${hasPrisma} layout=${hasLayout} page=${hasPage} components=${hasComponents}`);

    const sseTypes = [...new Set(r.sseEvents.map((e) => e.type))];
    console.log(`SSE types: ${sseTypes.join(", ")}`);
    console.log(`Has connected: ${r.sseEvents.some((e) => e.type === "connected")}`);
    console.log(`Has file.created: ${r.sseEvents.some((e) => e.type === "file.created")}`);
    console.log(`Has build.completed: ${r.sseEvents.some((e) => e.type === "build.completed")}`);
  }
}

async function main() {
  console.log("Phase 2 Final Validation");
  console.log("API:", API);

  const health = await fetch(`${API}/health`);
  const healthBody = await parseJson(health);
  console.log("Health:", JSON.stringify(healthBody));

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
          clarifierQuestions: false,
          error: String(err),
        });
      }
    }

    evaluateQuality(results);

    console.log("\n\nSUMMARY TABLE");
    console.log("| Project | Files | Duration(s) | Tokens | Tools | Retries | Status |");
    for (const r of results) {
      console.log(
        `| ${r.name} | ${r.fileCount} | ${(r.buildDurationMs / 1000).toFixed(0)} | ${r.totalTokens} | ${r.toolCallCount} | ${r.retryCount} | ${r.finalStatus} |`
      );
    }

    const allReady = results.every((r) => r.finalStatus === "ready");
    process.exit(allReady ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
