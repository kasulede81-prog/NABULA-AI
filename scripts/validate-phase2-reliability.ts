/**
 * Phase 2 reliability validation — CRM, Task Manager, Restaurant POS.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 3000;

const PROJECTS = [
  { name: "Simple CRM", prompt: "Build a simple CRM" },
  { name: "Task Manager", prompt: "Build a task manager" },
  { name: "Restaurant POS", prompt: "Build a restaurant POS" },
];

interface TestResult {
  name: string;
  projectId: string;
  finalStatus: string;
  fileCount: number;
  hasPage: boolean;
  toolCalls: number;
  buildDurationMs: number;
  retries: number;
  errorCode?: string | null;
  failurePhase?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
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
  const email = `rel-val-${Date.now()}@test.com`;
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "Reliability Validator" }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(`Register failed: ${JSON.stringify(body)}`);
  return body.token as string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTerminal(projectId: string, token: string) {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  const startedAt = Date.now();
  let clarifyNudgeSent = false;

  while (Date.now() < deadline) {
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const project = await parseJson(res);
    if (project.status === "ready" || project.status === "failed") {
      return project.status as string;
    }

    if (
      project.status === "clarifying" &&
      !project.specJson &&
      !clarifyNudgeSent &&
      Date.now() - startedAt > 45_000
    ) {
      clarifyNudgeSent = true;
      await fetch(`${API}/projects/${projectId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: "Use reasonable defaults. Proceed with the build immediately.",
        }),
      });
    }

    await sleep(POLL_MS);
  }
  throw new Error("Timeout waiting for build");
}

async function runProject(
  prisma: PrismaClient,
  token: string,
  test: { name: string; prompt: string }
): Promise<TestResult> {
  console.log(`\n${"=".repeat(60)}\nPROJECT: ${test.name}\n${"=".repeat(60)}`);

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
  const finalStatus = await waitForTerminal(projectId, token);

  const filesRes = await fetch(`${API}/projects/${projectId}/files`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const filesBody = await parseJson(filesRes);
  const files = ((filesBody.data as Array<{ path: string }>) ?? []).map((f) => f.path);

  const runs = await prisma.agentRun.findMany({
    where: { projectId, agentType: "builder" },
    orderBy: { createdAt: "desc" },
  });
  const lastBuilder = runs[0];

  let retries = 0;
  for (const run of runs) {
    if ((run.retryCount ?? 0) > 0) retries = Math.max(retries, run.retryCount ?? 0);
  }

  const result: TestResult = {
    name: test.name,
    projectId,
    finalStatus,
    fileCount: files.length,
    hasPage: files.some((f) => f.endsWith("page.tsx")),
    toolCalls: runs.reduce((sum, r) => sum + (r.toolCalls ?? 0), 0),
    buildDurationMs: runs.reduce((sum, r) => sum + (r.buildDurationMs ?? 0), 0),
    retries,
    errorCode: lastBuilder?.errorCode,
    failurePhase: lastBuilder?.failurePhase,
    errorMessage: lastBuilder?.errorMessage,
    retryCount: lastBuilder?.retryCount,
  };

  console.log(
    `Result: ${result.finalStatus} | files=${result.fileCount} | page=${result.hasPage} | tools=${result.toolCalls} | duration=${(result.buildDurationMs / 1000).toFixed(1)}s | retries=${result.retries}`
  );
  if (result.finalStatus === "failed") {
    console.log(
      `Failure: phase=${result.failurePhase ?? "unknown"} code=${result.errorCode ?? "unknown"} msg=${result.errorMessage ?? "unknown"}`
    );
  }

  return result;
}

function reliabilityScore(results: TestResult[]): number {
  let score = 0;
  const weights = {
    success: 40,
    pageOnSuccess: 15,
    failureVisibility: 15,
    noExcessiveRetries: 15,
    toolEfficiency: 15,
  };

  const successCount = results.filter((r) => r.finalStatus === "ready").length;
  score += (successCount / results.length) * weights.success;

  const ready = results.filter((r) => r.finalStatus === "ready");
  if (ready.length > 0) {
    const withPage = ready.filter((r) => r.hasPage).length;
    score += (withPage / ready.length) * weights.pageOnSuccess;
  } else {
    score += 0;
  }

  const failed = results.filter((r) => r.finalStatus === "failed");
  if (failed.length === 0) {
    score += weights.failureVisibility;
  } else {
    const visible = failed.filter((r) => r.errorCode && r.errorMessage).length;
    score += (visible / failed.length) * weights.failureVisibility;
  }

  const lowRetry = results.filter((r) => r.retries <= 1).length;
  score += (lowRetry / results.length) * weights.noExcessiveRetries;

  const efficient = results.filter((r) => r.toolCalls <= 15).length;
  score += (efficient / results.length) * weights.toolEfficiency;

  return Math.round(score);
}

async function main() {
  console.log("Phase 2 Reliability Validation");
  console.log("API:", API);

  const ready = await fetch(`${API}/health/ready`);
  if (!ready.ok) {
    console.error("API not ready. Start API and run db:migrate:deploy first.");
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
        console.error(`ERROR ${test.name}:`, err);
        results.push({
          name: test.name,
          projectId: "",
          finalStatus: "error",
          fileCount: 0,
          hasPage: false,
          toolCalls: 0,
          buildDurationMs: 0,
          retries: 0,
          errorMessage: String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.finalStatus === "ready").length;
    const successRate = (successCount / results.length) * 100;
    const score = reliabilityScore(results);

    console.log("\n" + "=".repeat(70));
    console.log("RELIABILITY REPORT");
    console.log("=".repeat(70));
    console.log(`\nA. Success rate: ${successRate.toFixed(0)}% (${successCount}/${results.length})`);
    console.log(`B. Reliability score: ${score}/100`);
    console.log("\nC. Remaining blockers:");
    const blockers: string[] = [];
    for (const r of results) {
      if (r.finalStatus !== "ready") {
        blockers.push(
          `${r.name}: ${r.finalStatus} — ${r.errorCode ?? "no code"} @ ${r.failurePhase ?? "unknown phase"}`
        );
      } else if (!r.hasPage) {
        blockers.push(`${r.name}: ready but missing page.tsx`);
      }
    }
    if (blockers.length === 0) {
      console.log("  None — all builds passed.");
    } else {
      for (const b of blockers) console.log(`  - ${b}`);
    }

    console.log("\n| Project | Status | Files | Tools | Duration | Retries | Error |");
    console.log("|---------|--------|-------|-------|----------|---------|-------|");
    for (const r of results) {
      console.log(
        `| ${r.name} | ${r.finalStatus} | ${r.fileCount} | ${r.toolCalls} | ${(r.buildDurationMs / 1000).toFixed(0)}s | ${r.retries} | ${r.errorCode ?? "-"} |`
      );
    }

    process.exit(successCount === results.length ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
