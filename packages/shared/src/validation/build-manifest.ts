import type { AppSpec } from "../schemas/spec";

export interface BuildPhase {
  id: string;
  name: string;
  targetFiles: string[];
  /** When true, phase failure does not block READY status. */
  optional?: boolean;
}

export const PHASE_FOUNDATION = "foundation";
export const PHASE_SHELL_UI = "shell-ui";
export const PHASE_API_BULK = "api-bulk";
export const PHASE_POLISH = "polish";

const FOUNDATION_FILES = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.js",
  "tailwind.config.ts",
  "prisma/schema.prisma",
  "src/lib/prisma.ts",
  "src/lib/utils.ts",
  "src/app/globals.css",
  "src/app/layout.tsx",
];

const SHELL_UI_FILES = ["src/app/page.tsx"];

const POLISH_COMPONENTS = [
  "src/components/Sidebar.tsx",
  "src/components/PageHeader.tsx",
  "src/components/StatCard.tsx",
];

const DEFAULT_ENTITIES: Record<string, string[]> = {
  crm: ["contacts", "companies", "deals", "activities"],
  task: ["tasks", "projects"],
  pos: ["categories", "menu-items", "tables", "orders"],
  restaurant: ["categories", "menu-items", "tables", "orders"],
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveEntitySlugs(spec: AppSpec): string[] {
  if (spec.entities?.length) {
    return spec.entities.map((e) => slugify(e.name));
  }

  const appType = spec.appType.toLowerCase();
  for (const [key, slugs] of Object.entries(DEFAULT_ENTITIES)) {
    if (appType.includes(key)) {
      return slugs;
    }
  }

  return spec.features.slice(0, 4).map((f) => slugify(f));
}

export function collectionRoutesForEntities(slugs: string[]): string[] {
  return slugs.map((slug) => `src/app/api/${slug}/route.ts`);
}

export function polishRoutesForEntities(slugs: string[]): string[] {
  const files = ["src/app/api/dashboard/route.ts"];
  for (const slug of slugs) {
    files.push(`src/app/api/${slug}/[id]/route.ts`);
  }
  return files;
}

/** Ready-first manifest: foundation → shell-ui → api-bulk → polish. */
export function buildManifest(spec: AppSpec): BuildPhase[] {
  const entities = resolveEntitySlugs(spec);

  return [
    {
      id: PHASE_FOUNDATION,
      name: "Foundation",
      targetFiles: [...FOUNDATION_FILES],
    },
    {
      id: PHASE_SHELL_UI,
      name: "Shell UI",
      targetFiles: [...SHELL_UI_FILES],
    },
    {
      id: PHASE_API_BULK,
      name: "API collection routes",
      targetFiles: collectionRoutesForEntities(entities),
      optional: true,
    },
    {
      id: PHASE_POLISH,
      name: "Polish and enhancements",
      targetFiles: [...POLISH_COMPONENTS, ...polishRoutesForEntities(entities)],
      optional: true,
    },
  ];
}

/** Phases that must succeed for READY status. */
export function isReadyCriticalPhase(phaseId: string): boolean {
  return phaseId === PHASE_FOUNDATION || phaseId === PHASE_SHELL_UI;
}

export function isOptionalPhase(phase: BuildPhase): boolean {
  return phase.optional === true;
}

export function phaseIndex(manifest: BuildPhase[], phaseId: string): number {
  return manifest.findIndex((p) => p.id === phaseId);
}

export function pageComesBeforeApiBulk(manifest: BuildPhase[]): boolean {
  const pageIdx = manifest.findIndex((p) =>
    p.targetFiles.some((f) => f.endsWith("page.tsx"))
  );
  const apiIdx = manifest.findIndex((p) => p.id === PHASE_API_BULK);
  return pageIdx >= 0 && apiIdx >= 0 && pageIdx < apiIdx;
}

export function nextPhase(manifest: BuildPhase[], existingPaths: string[]): BuildPhase | null {
  const existing = new Set(existingPaths);
  for (const phase of manifest) {
    if (phase.targetFiles.some((f) => !existing.has(f))) {
      return phase;
    }
  }
  return null;
}

export function missingInPhase(phase: BuildPhase, existingPaths: string[]): string[] {
  const existing = new Set(existingPaths);
  return phase.targetFiles.filter((f) => !existing.has(f));
}

export function buildPhasePrompt(
  spec: AppSpec,
  phase: BuildPhase,
  missing: string[],
  existingPaths: string[]
): string {
  const hints: Record<string, string> = {
    [PHASE_FOUNDATION]:
      "Write ALL foundation files in a single write_files call. Include config, Prisma schema, lib helpers, and layout.",
    [PHASE_SHELL_UI]:
      "Write src/app/page.tsx now. Minimal working UI with Tailwind. Use mock data or Prisma in Server Components — API routes are not required yet.",
    [PHASE_API_BULK]:
      "Write ALL collection API routes (src/app/api/{entity}/route.ts) in one write_files call. Do NOT write [id] or dashboard routes.",
    [PHASE_POLISH]:
      "Optional enhancements: components, dashboard route, and [id] API routes. Write all missing polish files in one write_files call.",
  };

  return [
    `PHASE: ${phase.name} (${phase.id})`,
    `APP: ${spec.name} (${spec.appType})`,
    `FEATURES: ${spec.features.join(", ")}`,
    phase.optional ? "PRIORITY: optional — best effort" : "PRIORITY: required for READY",
    "",
    hints[phase.id] ?? "",
    "",
    "WRITE ONLY the missing files below — do NOT rewrite files that already exist.",
    `Missing (${missing.length}):`,
    missing.map((f) => `- ${f}`).join("\n"),
    "",
    `Already exist (${existingPaths.length}): ${existingPaths.join(", ") || "(none)"}`,
    "",
    "Use a single write_files call for all missing files in this phase.",
    "Write complete runnable TypeScript — no TODOs.",
  ]
    .filter(Boolean)
    .join("\n");
}
