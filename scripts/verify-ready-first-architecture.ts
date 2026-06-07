/**
 * Architecture tests for ready-first builder manifest and validation tiers.
 */
import {
  buildManifest,
  isOptionalPhase,
  isReadyCriticalPhase,
  nextPhase,
  pageComesBeforeApiBulk,
  PHASE_API_BULK,
  PHASE_FOUNDATION,
  PHASE_POLISH,
  PHASE_SHELL_UI,
  validateBuildReady,
  validateBuildQuality,
} from "@nebula/shared";
import type { AppSpec } from "@nebula/shared";

const crmSpec: AppSpec = {
  appType: "CRM",
  name: "Simple CRM",
  description: "CRM",
  features: ["contacts", "deals"],
  stack: "nextjs-prisma-tailwind",
};

const taskSpec: AppSpec = {
  appType: "task manager",
  name: "Task Manager",
  description: "Tasks",
  features: ["tasks", "projects"],
  stack: "nextjs-prisma-tailwind",
};

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function foundationPaths(spec: AppSpec): string[] {
  const manifest = buildManifest(spec);
  const foundation = manifest.find((p) => p.id === PHASE_FOUNDATION)!;
  return foundation.targetFiles;
}

function shellUiPaths(spec: AppSpec): string[] {
  const manifest = buildManifest(spec);
  const shell = manifest.find((p) => p.id === PHASE_SHELL_UI)!;
  return shell.targetFiles;
}

// --- Manifest ordering ---

const crmManifest = buildManifest(crmSpec);
check("page.tsx phase comes before api-bulk", pageComesBeforeApiBulk(crmManifest));

const shellIdx = crmManifest.findIndex((p) => p.id === PHASE_SHELL_UI);
const apiIdx = crmManifest.findIndex((p) => p.id === PHASE_API_BULK);
check("shell-ui index < api-bulk index", shellIdx < apiIdx);

const pagePhase = crmManifest[shellIdx];
check("shell-ui targets page.tsx", pagePhase?.targetFiles.includes("src/app/page.tsx"));

const apiPhase = crmManifest[apiIdx];
check(
  "api-bulk has no [id] routes",
  apiPhase?.targetFiles.every((f) => !f.includes("[id]"))
);
check(
  "api-bulk has no dashboard route",
  apiPhase?.targetFiles.every((f) => !f.includes("dashboard"))
);

const polishPhase = crmManifest.find((p) => p.id === PHASE_POLISH)!;
check(
  "polish includes dashboard and [id]",
  polishPhase.targetFiles.some((f) => f.includes("dashboard")) &&
    polishPhase.targetFiles.some((f) => f.includes("[id]"))
);

// --- READY gate after shell-ui ---

const afterShell = [...foundationPaths(crmSpec), ...shellUiPaths(crmSpec)];
const readyAfterShell = validateBuildReady({ paths: afterShell, spec: crmSpec });
check("READY possible after shell-ui (no API)", readyAfterShell.ok);

// --- API not required for READY ---

const withoutApi = afterShell;
check("paths without api-bulk still pass ready", validateBuildReady({ paths: withoutApi, spec: crmSpec }).ok);
check(
  "paths without api-bulk fail quality",
  !validateBuildQuality({ paths: withoutApi, spec: crmSpec }).ok
);

// --- Polish optional ---

const withApiOnly = [
  ...afterShell,
  "src/app/api/contacts/route.ts",
  "src/app/api/companies/route.ts",
];
check("api-bulk present without polish passes ready", validateBuildReady({ paths: withApiOnly, spec: crmSpec }).ok);
check(
  "api-bulk without polish fails quality (no components)",
  !validateBuildQuality({ paths: withApiOnly, spec: crmSpec }).ok
);

const polishOnlyMissing = afterShell;
check(
  "polish failures do not prevent ready",
  validateBuildReady({ paths: polishOnlyMissing, spec: crmSpec }).ok
);

// --- Phase progression ---

check(
  "nextPhase after foundation is shell-ui",
  nextPhase(crmManifest, foundationPaths(crmSpec))?.id === PHASE_SHELL_UI
);
check(
  "nextPhase after shell-ui is api-bulk",
  nextPhase(crmManifest, afterShell)?.id === PHASE_API_BULK
);

// --- Critical vs optional ---

check("foundation is ready-critical", isReadyCriticalPhase(PHASE_FOUNDATION));
check("shell-ui is ready-critical", isReadyCriticalPhase(PHASE_SHELL_UI));
check("api-bulk is not ready-critical", !isReadyCriticalPhase(PHASE_API_BULK));
check("polish is not ready-critical", !isReadyCriticalPhase(PHASE_POLISH));
check("api-bulk phase is optional", isOptionalPhase(crmManifest[2]!));
check("polish phase is optional", isOptionalPhase(crmManifest[3]!));

// --- Task manager variant ---

const taskManifest = buildManifest(taskSpec);
check("task manager has 4 phases", taskManifest.length === 4);
check(
  "task api-bulk has 2 collection routes",
  taskManifest.find((p) => p.id === PHASE_API_BULK)?.targetFiles.length === 2
);

const taskAfterShell = [...foundationPaths(taskSpec), ...shellUiPaths(taskSpec)];
check("task manager ready after shell-ui", validateBuildReady({ paths: taskAfterShell, spec: taskSpec }).ok);

console.log(`\n--- ${passed}/${passed + failed} architecture checks passed ---`);
process.exit(failed > 0 ? 1 : 0);
