import path from "path";
import { config } from "dotenv";
import { PrismaClient } from "@nebula/database";

config({ path: path.resolve(__dirname, "../.env") });

async function inspect(label: string, url: string) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const host = url.match(/@([^/]+)/)?.[1] ?? "unknown";
  console.log(`\n=== ${label} (${host}) ===`);

  const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations ORDER BY finished_at
  `;
  console.log("Migrations:", migrations.length, migrations.map((m) => m.migration_name).join(", "));

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log("Tables:", tables.map((t) => t.table_name).join(", "));

  await prisma.$disconnect();
}

async function main() {
  const pool = process.env.DATABASE_URL!;
  const direct = process.env.DIRECT_URL!;
  await inspect("DATABASE_URL (pooler)", pool);
  await inspect("DIRECT_URL (migrations)", direct);
}

main().catch(console.error);
