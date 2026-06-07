/**
 * Phase 1 smoke verification. Requires API running and PostgreSQL migrated.
 * Usage: npx tsx scripts/verify-phase1.ts
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

interface StepResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: StepResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${name}: ${detail}`);
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readSseEvents(
  url: string,
  token: string,
  maxEvents: number,
  timeoutMs: number
): Promise<Array<{ type: string; data: unknown }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const events: Array<{ type: string; data: unknown }> = [];

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (events.length < maxEvents) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim() || part.startsWith(":")) continue;
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const parsed = JSON.parse(dataLine.slice(6));
        events.push({ type: parsed.type, data: parsed.data });
        if (events.length >= maxEvents) break;
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return events;
}

async function main() {
  console.log("Nebula AI — Phase 1 Verification\n");

  // Health
  try {
    const health = await fetch(`${API}/health`);
    const body = await parseJson(health);
    record("API health", health.ok, JSON.stringify(body));
  } catch (e) {
    record("API health", false, String(e));
    printSummary();
    process.exit(1);
  }

  try {
    const ready = await fetch(`${API}/health/ready`);
    const body = await parseJson(ready);
    record("DB ready", ready.ok, JSON.stringify(body));
    if (!ready.ok) {
      printSummary();
      process.exit(1);
    }
  } catch (e) {
    record("DB ready", false, String(e));
    printSummary();
    process.exit(1);
  }

  const email = `verify-${Date.now()}@test.com`;
  const password = "password123";
  let token = "";
  let projectId = "";

  // Register
  const reg = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Verify User" }),
  });
  const regBody = await parseJson(reg);
  record("Auth register", reg.ok, reg.ok ? regBody.user?.email : JSON.stringify(regBody));
  if (!reg.ok) {
    printSummary();
    process.exit(1);
  }
  token = regBody.token;

  // Me
  const me = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  record("Auth me", me.ok, me.ok ? (await me.json()).email : await me.text());

  // Project
  const proj = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Verify Project",
      prompt: "Phase 1 verification project",
    }),
  });
  const projBody = await parseJson(proj);
  record("Create project", proj.ok, proj.ok ? projBody.id : JSON.stringify(projBody));
  if (!proj.ok) {
    printSummary();
    process.exit(1);
  }
  projectId = projBody.id;

  // Message
  const msg = await fetch(`${API}/projects/${projectId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: "Hello from verification" }),
  });
  record("Send message", msg.ok, msg.ok ? "created" : await msg.text());

  // SSE + file write
  const sseUrl = `${API}/projects/${projectId}/events`;
  const ssePromise = readSseEvents(sseUrl, token, 3, 8000);

  await new Promise((r) => setTimeout(r, 500));

  const file = await fetch(`${API}/projects/${projectId}/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      path: "src/verify.ts",
      content: "export const verified = true;\n",
    }),
  });
  record("Write file", file.ok, file.ok ? "created" : await file.text());

  const sseEvents = await ssePromise;
  const types = sseEvents.map((e) => e.type).join(", ");
  const hasConnected = sseEvents.some((e) => e.type === "connected");
  const hasFileEvent = sseEvents.some(
    (e) => e.type === "file.created" || e.type === "file.updated"
  );
  record(
    "SSE streaming",
    hasConnected && hasFileEvent,
    `events=[${types}] connected=${hasConnected} file=${hasFileEvent}`
  );

  // Read file
  const read = await fetch(`${API}/projects/${projectId}/files/src/verify.ts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  record("Read file", read.ok, read.ok ? "ok" : await read.text());

  // Delete file
  const del = await fetch(`${API}/projects/${projectId}/files/src/verify.ts`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  record("Delete file", del.ok, del.ok ? "deleted" : await del.text());

  printSummary();
  const allPass = results.every((r) => r.pass);
  process.exit(allPass ? 0 : 1);
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- ${passed}/${results.length} checks passed ---`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
