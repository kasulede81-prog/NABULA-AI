import path from "path";
import { config } from "dotenv";
import { PrismaClient } from "@nebula/database";

config({ path: path.resolve(__dirname, "../.env"), override: true });

const prisma = new PrismaClient();

const expected = [
  "users",
  "projects",
  "messages",
  "files",
  "agent_runs",
  "previews",
  "github_connections",
  "analytics_events",
];

async function main() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  const names = rows.map((r) => r.table_name);
  console.log("Tables:", names.join(", "));

  let ok = true;
  for (const table of expected) {
    const found = names.includes(table);
    console.log(`[${found ? "PASS" : "FAIL"}] ${table}`);
    if (!found) ok = false;
  }

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
