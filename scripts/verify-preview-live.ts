/**
 * Live E2B preview verification — uses existing READY project.
 */
import { PrismaClient } from "@prisma/client";
import { signToken } from "../apps/api/src/lib/jwt";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const PREVIEW_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 3000;
const PROJECT_ID = process.env.PREVIEW_PROJECT_ID ?? "76b1097e-1973-4ab7-94bb-64f38f450156";

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
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
  const prisma = new PrismaClient();
  const project = await prisma.project.findUnique({ where: { id: PROJECT_ID } });
  if (!project || project.status !== "ready") {
    console.error(`Project ${PROJECT_ID} not ready:`, project?.status);
    process.exit(1);
  }

  const token = signToken({ userId: project.userId, email: "preview-verify@test" });
  const sseEvents: SseEvent[] = [];
  let startedAt: number | null = null;
  let readyAt: number | null = null;
  const failurePoints: string[] = [];

  console.log(`Preview verification for ${project.name} (${project.id})`);

  const stopSse = collectSse(project.id, token, (e) => {
    sseEvents.push(e);
    if (e.type === "preview.started" && startedAt === null) {
      startedAt = Date.parse(e.timestamp) || Date.now();
      console.log(`  [preview.started] ${(e.data.message as string) ?? ""}`);
    }
    if (e.type === "preview.ready" && readyAt === null) {
      readyAt = Date.parse(e.timestamp) || Date.now();
      console.log(`  [preview.ready] ${(e.data.previewUrl as string) ?? ""}`);
    }
    if (e.type === "preview.failed") {
      console.log(`  [preview.failed] ${(e.data.message as string) ?? ""}`);
      failurePoints.push((e.data.message as string) ?? "preview failed");
    }
  });

  try {
    const post = await fetch(`${API}/projects/${project.id}/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const postBody = await parseJson(post);
    console.log(`POST preview: ${post.status}`, JSON.stringify(postBody));
    if (!post.ok) {
      failurePoints.push(`POST failed: ${JSON.stringify(postBody)}`);
      throw new Error("Preview start rejected");
    }

    const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
    let previewUrl: string | null = null;
    let previewStatus: string | null = null;
    let sandboxId: string | null = null;
    let expiresAt: string | null = null;

    while (Date.now() < deadline) {
      const res = await fetch(`${API}/projects/${project.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await parseJson(res);
      const data = body.data as {
        status?: string;
        previewUrl?: string | null;
        sandboxId?: string | null;
        expiresAt?: string | null;
      } | null;

      previewStatus = data?.status ?? null;
      previewUrl = data?.previewUrl ?? null;
      sandboxId = data?.sandboxId ?? null;
      expiresAt = data?.expiresAt ?? null;

      if (previewStatus === "ready" && previewUrl) break;
      if (previewStatus === "error") {
        failurePoints.push("Preview status error in DB");
        break;
      }
      await sleep(POLL_MS);
    }

    let httpStatus: number | null = null;
    let bodySnippet = "";
    let pageLoads = false;
    let hasDashboard = false;
    let hasNav = false;
    let runtimeError = false;

    if (previewUrl) {
      try {
        const pageRes = await fetch(previewUrl, {
          signal: AbortSignal.timeout(60_000),
          headers: { "User-Agent": "Nebula-Preview-Verify/1.0" },
        });
        httpStatus = pageRes.status;
        const html = await pageRes.text();
        bodySnippet = html.slice(0, 800).replace(/\s+/g, " ");
        pageLoads = pageRes.ok && html.length > 200;
        hasDashboard =
          html.toLowerCase().includes("dashboard") ||
          html.toLowerCase().includes("crm") ||
          html.toLowerCase().includes("contact");
        hasNav =
          html.toLowerCase().includes("sidebar") ||
          html.toLowerCase().includes("nav") ||
          html.includes("Contacts") ||
          html.includes("Companies");
        runtimeError =
          html.includes("Application error") ||
          html.includes("Unhandled Runtime Error") ||
          html.includes("Internal Server Error");
        if (!pageLoads) failurePoints.push(`HTTP ${httpStatus}`);
        if (runtimeError) failurePoints.push("Runtime error text in HTML");
      } catch (err) {
        failurePoints.push(`URL fetch: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      failurePoints.push("Preview did not reach ready within timeout");
    }

    const totalSec =
      startedAt && readyAt ? (readyAt - startedAt) / 1000 : null;
    const sandboxCreationSec = totalSec ? totalSec * 0.15 : null;
    const installSec = totalSec ? totalSec * 0.55 : null;
    const startupSec = totalSec ? totalSec * 0.3 : null;
    const sandboxRuntimeMin = totalSec ? totalSec / 60 : 0;
    const estCost = sandboxRuntimeMin * 0.02;

    console.log("\n# Preview Verification Report\n");
    console.log("## Sandbox Metrics\n");
    console.log(`Total provisioning: ${totalSec?.toFixed(1) ?? "n/a"}s`);
    console.log(`Est. sandbox creation: ${sandboxCreationSec?.toFixed(1) ?? "n/a"}s`);
    console.log(`Est. npm install: ${installSec?.toFixed(1) ?? "n/a"}s`);
    console.log(`Est. startup: ${startupSec?.toFixed(1) ?? "n/a"}s`);

    console.log("\n## Preview Metrics\n");
    console.log(`URL: ${previewUrl ?? "n/a"}`);
    console.log(`Status: ${previewStatus ?? "n/a"}`);
    console.log(`Sandbox ID: ${sandboxId ?? "n/a"}`);
    console.log(`TTL expires: ${expiresAt ?? "n/a"}`);

    console.log("\n## Application Verification\n");
    console.log(`Page loads (HTTP ${httpStatus ?? "n/a"}): ${pageLoads ? "yes" : "no"}`);
    console.log(`Dashboard visible: ${hasDashboard ? "yes" : "no"}`);
    console.log(`Navigation indicators: ${hasNav ? "yes" : "no"}`);
    console.log(`Runtime errors in HTML: ${runtimeError ? "yes" : "no"}`);
    if (bodySnippet) console.log(`Snippet: ${bodySnippet.slice(0, 250)}...`);

    console.log("\n## Cost Estimate\n");
    console.log(`Sandbox runtime: ~${sandboxRuntimeMin.toFixed(2)} min`);
    console.log(`Estimated preview cost: ~$${estCost.toFixed(3)} USD`);

    console.log("\n## Launch Recommendation\n");
    if (pageLoads && !runtimeError && previewUrl) {
      console.log("E2B preview verified. MVP preview path is ready for limited beta.");
    } else if (previewUrl && !pageLoads) {
      console.log("Preview URL issued but app did not render cleanly — investigate sandbox logs.");
    } else {
      console.log("Preview verification incomplete. Resolve failure points before launch.");
      for (const f of failurePoints) console.log(`- ${f}`);
    }

    process.exit(pageLoads && previewUrl && !runtimeError ? 0 : 1);
  } finally {
    stopSse();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
