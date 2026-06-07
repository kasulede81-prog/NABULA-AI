/**
 * Quick single-project build test.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const TIMEOUT_MS = 15 * 60 * 1000;

async function main() {
  const email = `single-${Date.now()}@test.com`;
  const reg = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "Single Test" }),
  });
  const { token } = await reg.json();

  const create = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "CRM Test", prompt: "Build a simple CRM" }),
  });
  const project = await create.json();
  console.log("Project:", project.id);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p = await res.json();
    console.log(`Status: ${p.status}`);
    if (p.status === "ready" || p.status === "failed") {
      const files = await fetch(`${API}/projects/${project.id}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await files.json();
      const paths = (body.data ?? []).map((f: { path: string }) => f.path);
      console.log(`Files (${paths.length}):`, paths.sort().join("\n"));
      console.log("Has page.tsx:", paths.some((f: string) => f.endsWith("page.tsx")));

      const prisma = new PrismaClient();
      const runs = await prisma.agentRun.findMany({ where: { projectId: project.id } });
      for (const r of runs) {
        console.log(
          `${r.agentType} ${r.status}: tools=${r.toolCalls} tokens=${r.tokensInput}/${r.tokensOutput} err=${r.errorMessage ?? "-"}`
        );
      }
      await prisma.$disconnect();
      process.exit(p.status === "ready" ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.error("Timeout");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
