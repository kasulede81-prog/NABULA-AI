/**
 * Railway API deployment — static verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

console.log("Railway API Deployment Verification\n");

const railwayToml = read("apps/api/railway.toml");
const nixpacks = read("nixpacks.toml");
const startSh = read("apps/api/scripts/railway-start.sh");
const envExample = read("apps/api/railway.env.example");
const envTs = read("apps/api/src/config/env.ts");
const indexTs = read("apps/api/src/index.ts");

check("railway.toml exists", railwayToml.includes("[build]"));
check("build: pnpm install", railwayToml.includes("pnpm install"));
check("build: database generate", railwayToml.includes("@nebula/database generate"));
check("build: api build", railwayToml.includes("@nebula/api build"));
check("start: railway-start.sh", railwayToml.includes("railway-start.sh"));
check("healthcheck /v1/health", railwayToml.includes('healthcheckPath = "/v1/health"'));

check("nixpacks node 20", nixpacks.includes("nodejs_20"));
check("nixpacks pnpm", nixpacks.includes("pnpm"));

check("start script maps PORT to API_PORT", startSh.includes('API_PORT="${PORT'));
check("start script runs dist/index.js", startSh.includes("node dist/index.js"));
check("start script binds 0.0.0.0 default", startSh.includes("API_HOST"));

check("env.ts API_PORT schema", envTs.includes("API_PORT"));
check("index listens on env.API_PORT", indexTs.includes("env.API_PORT"));
check("railway.env.example DATABASE_URL", envExample.includes("DATABASE_URL"));
check("railway.env.example WEB_URL", envExample.includes("WEB_URL=https://dev.ugazon.com"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
