/**
 * Starts embedded PostgreSQL when Docker is unavailable.
 * Credentials match infrastructure/docker-compose.yml and .env.example.
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", ".embedded-postgres");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "nebula",
  password: "nebula_dev",
  port: 5432,
  persistent: true,
});

async function main() {
  console.log("[postgres] Initialising embedded PostgreSQL 16...");
  await pg.initialise();
  console.log("[postgres] Starting server on localhost:5432...");
  await pg.start();

  try {
    await pg.createDatabase("nebula_ai");
    console.log("[postgres] Database nebula_ai ready");
  } catch {
    console.log("[postgres] Database nebula_ai already exists");
  }

  console.log(
    "[postgres] Connection: postgresql://nebula:nebula_dev@localhost:5432/nebula_ai"
  );
  console.log("[postgres] Press Ctrl+C to stop");

  const shutdown = async () => {
    console.log("\n[postgres] Stopping...");
    await pg.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[postgres] Failed:", err);
  process.exit(1);
});
