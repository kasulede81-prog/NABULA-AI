import {
  buildManifest,
  nextPhase,
  missingInPhase,
  pageComesBeforeApiBulk,
  PHASE_API_BULK,
  PHASE_FOUNDATION,
  PHASE_POLISH,
  PHASE_SHELL_UI,
  collectionRoutesForEntities,
} from "@nebula/shared";
import type { AppSpec } from "@nebula/shared";

const crmSpec: AppSpec = {
  appType: "CRM",
  name: "Simple CRM",
  description: "CRM app",
  features: ["contacts", "deals"],
  stack: "nextjs-prisma-tailwind",
};

const manifest = buildManifest(crmSpec);
const phase = nextPhase(manifest, []);
const missing = phase ? missingInPhase(phase, []) : [];

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

check("manifest has 4 ready-first phases", manifest.length === 4);
check("first phase is foundation", manifest[0]?.id === PHASE_FOUNDATION);
check("second phase is shell-ui", manifest[1]?.id === PHASE_SHELL_UI);
check("third phase is api-bulk", manifest[2]?.id === PHASE_API_BULK);
check("fourth phase is polish", manifest[3]?.id === PHASE_POLISH);
check("foundation has package.json", manifest[0]?.targetFiles.includes("package.json"));
check("foundation has prisma schema", manifest[0]?.targetFiles.includes("prisma/schema.prisma"));
check("foundation has layout.tsx", manifest[0]?.targetFiles.includes("src/app/layout.tsx"));
check("shell-ui has page.tsx only", manifest[1]?.targetFiles.join() === "src/app/page.tsx");
check(
  "api-bulk has collection routes only",
  manifest[2]?.targetFiles.every(
    (f) => f.endsWith("/route.ts") && !f.includes("[id]") && !f.includes("dashboard")
  )
);
check(
  "polish includes dashboard and [id] routes",
  manifest[3]?.targetFiles.some((f) => f.includes("dashboard")) &&
    manifest[3]?.targetFiles.some((f) => f.includes("[id]"))
);
check("page.tsx comes before api-bulk", pageComesBeforeApiBulk(manifest));
check("api-bulk is optional", manifest[2]?.optional === true);
check("polish is optional", manifest[3]?.optional === true);
check("next phase from empty is foundation", phase?.id === PHASE_FOUNDATION);
check("foundation missing includes package.json", missing.includes("package.json"));

const apiRoutes = collectionRoutesForEntities(["contacts", "deals"]);
check(
  "api-bulk routes match entity slugs",
  manifest[2]?.targetFiles.includes(apiRoutes[0]!) &&
    manifest[2]?.targetFiles.includes(apiRoutes[1]!)
);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
