/**
 * Verifies build ready/quality validation rules (ready-first tiers).
 */
import {
  validateBuildReady,
  validateBuildQuality,
  type AppSpec,
} from "@nebula/shared";

const spec: AppSpec = {
  appType: "crm",
  name: "Test CRM",
  description: "A CRM app",
  features: ["contacts", "deals"],
  stack: "nextjs-prisma-tailwind",
};

const readyPaths = [
  "package.json",
  "prisma/schema.prisma",
  "src/app/layout.tsx",
  "src/app/page.tsx",
];

const completePaths = [
  ...readyPaths,
  "src/app/api/contacts/route.ts",
  "src/components/Sidebar.tsx",
];

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

const readyOk = validateBuildReady({ paths: readyPaths, spec });
check("foundation + shell-ui passes ready without API", readyOk.ok);

const readyWithApi = validateBuildReady({ paths: completePaths, spec });
check("full paths pass ready", readyWithApi.ok);

const noPage = validateBuildReady({
  paths: readyPaths.filter((p) => !p.includes("page.tsx")),
  spec,
});
check("missing page.tsx fails ready", !noPage.ok);

const noLayout = validateBuildReady({
  paths: readyPaths.filter((p) => !p.includes("layout.tsx")),
  spec,
});
check("missing layout.tsx fails ready", !noLayout.ok);

const noPackage = validateBuildReady({
  paths: readyPaths.filter((p) => p !== "package.json"),
  spec,
});
check("missing package.json fails ready", !noPackage.ok);

const noPrisma = validateBuildReady({
  paths: readyPaths.filter((p) => p !== "prisma/schema.prisma"),
  spec,
});
check("missing prisma schema fails ready", !noPrisma.ok);

const qualityWithoutApi = validateBuildQuality({ paths: readyPaths, spec });
check("ready paths without API fail quality", !qualityWithoutApi.ok);

const qualityOk = validateBuildQuality({ paths: completePaths, spec });
check("CRM paths with API pass quality", qualityOk.ok);

const polishMissingReady = validateBuildReady({ paths: readyPaths, spec });
const polishMissingQuality = validateBuildQuality({
  paths: [...readyPaths, "src/app/api/contacts/route.ts"],
  spec,
});
check("polish missing still passes ready", polishMissingReady.ok);
check("missing components fails quality only", !polishMissingQuality.ok);

const posSpec: AppSpec = {
  appType: "restaurant pos",
  name: "POS",
  description: "Point of sale",
  features: ["menu", "orders"],
  stack: "nextjs-prisma-tailwind",
};

const posReady = [
  "package.json",
  "prisma/schema.prisma",
  "src/app/layout.tsx",
  "src/app/page.tsx",
];

const posReadyResult = validateBuildReady({ paths: posReady, spec: posSpec });
check("POS ready without API routes", posReadyResult.ok);

const posQuality = validateBuildQuality({
  paths: [...posReady, "src/app/api/orders/route.ts", "src/components/Sidebar.tsx"],
  spec: posSpec,
});
check("POS paths pass quality with API and components", posQuality.ok);

const mismatch = validateBuildQuality({
  paths: [
    ...readyPaths,
    "src/app/api/blog/route.ts",
    "src/components/Sidebar.tsx",
  ],
  spec,
});
check("unrelated API fails CRM quality", !mismatch.ok);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
