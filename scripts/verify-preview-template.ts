/**
 * Phase 3 Preview Template — static verification (no E2B API calls).
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

console.log("Preview Template Verification\n");

const templateTs = read("infrastructure/e2b/template.ts");
const buildTs = read("infrastructure/e2b/build-template.ts");
const templatePkg = read("infrastructure/e2b/package.json");
const previewService = read("apps/api/src/services/preview.service.ts");
const envTs = read("apps/api/src/config/env.ts");
const rootEnv = read(".env.example");

// --- Template infrastructure ---
check("template.ts exists", templateTs.includes("export const template"));
check("build-template.ts exists", buildTs.includes("Template.build"));
check("template name nebula-nextjs-prisma", templateTs.includes("nebula-nextjs-prisma"));
check("template uses Node 20", templateTs.includes('fromNodeImage("20")'));
check("template runs npmInstall", templateTs.includes(".npmInstall()"));
check("build uses cpuCount 2", buildTs.includes("cpuCount: 2"));
check("build uses memoryMB 2048", buildTs.includes("memoryMB: 2048"));

const pkg = JSON.parse(templatePkg) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
check("stack includes Next.js 15", pkg.dependencies.next?.startsWith("15"));
check("stack includes Prisma 6", pkg.dependencies["@prisma/client"]?.startsWith("6"));
check("stack includes Tailwind", Boolean(pkg.devDependencies.tailwindcss));
check("stack includes TypeScript", Boolean(pkg.devDependencies.typescript));
check("template package.json omits postinstall", !templatePkg.includes("postinstall"));

// --- Preview runtime ---
check("preview uses E2B template", previewService.includes("template: env.E2B_PREVIEW_TEMPLATE"));
check("runtime npm install removed", !previewService.includes("npm install"));
check("keeps VFS snapshot write", previewService.includes("vfsService.snapshot"));
check("keeps prisma generate", previewService.includes("prisma generate"));
check("keeps prisma db push", previewService.includes("prisma db push"));
check("keeps npm run dev", previewService.includes("npm run dev"));

// --- Environment ---
check("E2B_PREVIEW_TEMPLATE in env schema", envTs.includes("E2B_PREVIEW_TEMPLATE"));
check("E2B_PREVIEW_TEMPLATE default", envTs.includes('"nebula-nextjs-prisma"'));
check(".env.example documents E2B_PREVIEW_TEMPLATE", rootEnv.includes("E2B_PREVIEW_TEMPLATE"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
