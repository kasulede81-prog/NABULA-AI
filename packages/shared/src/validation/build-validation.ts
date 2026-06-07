import type { AppSpec } from "../schemas/spec";

export interface BuildValidationInput {
  paths: string[];
  spec: AppSpec;
}

export interface BuildValidationResult {
  ok: boolean;
  errors: string[];
}

const APP_TYPE_KEYWORDS: Record<string, string[]> = {
  crm: ["contact", "deal", "company", "lead", "crm", "activity"],
  task: ["task", "todo", "project", "assignee"],
  pos: ["menu", "order", "table", "payment", "pos", "category", "kitchen"],
  restaurant: ["menu", "order", "table", "payment", "pos", "category"],
  inventory: ["product", "stock", "warehouse", "inventory", "sku"],
  blog: ["post", "article", "blog", "author", "comment"],
  ecommerce: ["product", "cart", "order", "checkout", "shop"],
};

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,_\-/]+/)
    .filter((w) => w.length > 3);
}

function keywordsForSpec(spec: AppSpec): string[] {
  const appType = spec.appType.toLowerCase();
  const keywords = new Set<string>();

  for (const [type, kws] of Object.entries(APP_TYPE_KEYWORDS)) {
    if (appType.includes(type)) {
      kws.forEach((k) => keywords.add(k));
    }
  }

  for (const feature of spec.features) {
    extractKeywords(feature).forEach((k) => keywords.add(k));
  }

  for (const page of spec.pages ?? []) {
    extractKeywords(page).forEach((k) => keywords.add(k));
  }

  for (const entity of spec.entities ?? []) {
    extractKeywords(entity.name).forEach((k) => keywords.add(k));
  }

  if (keywords.size === 0) {
    extractKeywords(appType).forEach((k) => keywords.add(k));
  }

  return [...keywords];
}

/**
 * Minimum structure required before a build may be marked READY.
 * API routes are not required.
 */
export function validateBuildReady(input: BuildValidationInput): BuildValidationResult {
  const errors: string[] = [];
  const { paths, spec } = input;

  if (!paths.includes("package.json")) {
    errors.push("Missing package.json");
  }

  const hasPage = paths.some((p) => p.endsWith("page.tsx"));
  if (!hasPage) {
    errors.push("Missing at least one page.tsx route");
  }

  const hasLayout = paths.some((p) => p.includes("layout.tsx"));
  if (!hasLayout) {
    errors.push("Missing app layout (layout.tsx)");
  }

  const needsDatabase = spec.stack === "nextjs-prisma-tailwind";
  if (needsDatabase && !paths.some((p) => p === "prisma/schema.prisma")) {
    errors.push("Missing prisma/schema.prisma");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Quality checks beyond READY — API routes, components, keyword alignment.
 * Failures here do not block READY status.
 */
export function validateBuildQuality(input: BuildValidationInput): BuildValidationResult {
  const errors: string[] = [];
  const pathsBlob = input.paths.join(" ").toLowerCase();
  const keywords = keywordsForSpec(input.spec);

  const matched = keywords.some((kw) => pathsBlob.includes(kw));
  if (!matched) {
    errors.push(
      `Generated structure does not match app type "${input.spec.appType}" (expected keywords: ${keywords.slice(0, 6).join(", ")})`
    );
  }

  const hasApi = input.paths.some((p) => p.includes("src/app/api/"));
  if (!hasApi) {
    errors.push("Missing API routes under src/app/api/");
  }

  const hasComponents = input.paths.some((p) => p.includes("src/components/"));
  if (!hasComponents) {
    errors.push("Missing UI components under src/components/");
  }

  return { ok: errors.length === 0, errors };
}
