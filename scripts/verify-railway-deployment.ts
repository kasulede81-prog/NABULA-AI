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
const nixpacksApi = read("apps/api/nixpacks.toml");
const startSh = read("apps/api/scripts/railway-start.sh");
const envExample = read("apps/api/railway.env.example");
const rootPkg = read("package.json");
const apiPkg = read("apps/api/package.json");

check("railway.toml exists", railwayToml.includes("[build]"));
check("build: database generate", railwayToml.includes("@nebula/database generate"));
check("build: api build", railwayToml.includes("@nebula/api build"));
const buildCmd = railwayToml.match(/buildCommand\s*=\s*"([^"]+)"/)?.[1] ?? "";
check(
  "buildCommand: uses pnpm not npm",
  buildCmd.includes("pnpm") && !/\bnpm\s+(install|i)\b/.test(buildCmd)
);
check("start: railway-start.sh", railwayToml.includes("railway-start.sh"));
check("healthcheck /v1/health", railwayToml.includes('healthcheckPath = "/v1/health"'));

check("root nixpacks providers node", nixpacks.includes('providers = ["node"]'));
check("root nixpacks node 20", nixpacks.includes("nodejs_20"));
check("root nixpacks corepack enable", nixpacks.includes("corepack enable"));
check("root nixpacks prepare pnpm@9.15.0", nixpacks.includes("pnpm@9.15.0"));
check("root nixpacks pnpm install", nixpacks.includes("pnpm install"));
check("root nixpacks no npm i", !nixpacks.match(/cmds\s*=\s*\[[^\]]*"npm i"/));

check("apps/api nixpacks mirrors root", nixpacksApi.includes("corepack enable"));
check("apps/api nixpacks pnpm install", nixpacksApi.includes("pnpm install"));

check("root packageManager pnpm", rootPkg.includes('"packageManager": "pnpm@9.15.0"'));
check("pnpm-workspace.yaml exists", read("pnpm-workspace.yaml").includes("apps/*"));
check("api uses workspace deps", apiPkg.includes('"@nebula/database": "workspace:*"'));
check("api uses workspace shared", apiPkg.includes('"@nebula/shared": "workspace:*"'));

check("start script maps PORT to API_PORT", startSh.includes('API_PORT="${PORT'));
check("start script runs dist/index.js", startSh.includes("node dist/index.js"));

check("railway.env.example DATABASE_URL", envExample.includes("DATABASE_URL"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
