import type { PreviewFramework, PreviewPackageManager } from "@nebula/shared";

export interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function parsePackageJson(content: string | undefined): PackageJsonShape | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJsonShape;
  } catch {
    return null;
  }
}

export function detectFramework(
  files: Array<{ path: string; content: string }>
): PreviewFramework {
  const pkg = files.find((f) => f.path === "package.json");
  const parsed = parsePackageJson(pkg?.content);
  if (!parsed) return "unknown";

  const deps = { ...parsed.dependencies, ...parsed.devDependencies };
  const scripts = parsed.scripts ?? {};

  if (deps.next || scripts["next dev"] || files.some((f) => f.path.startsWith("src/app/"))) {
    return "nextjs";
  }
  if (deps.vite || scripts.dev?.includes("vite") || files.some((f) => f.path.includes("vite.config"))) {
    return "vite";
  }
  if (deps.express || files.some((f) => /express|server\.(ts|js)/.test(f.path))) {
    return "express";
  }
  if (scripts.start || scripts.dev) {
    return "node";
  }
  return "unknown";
}

function pmRun(pm: PreviewPackageManager, script: string, args = ""): string {
  const suffix = args ? ` -- ${args}` : "";
  switch (pm) {
    case "pnpm":
      return `pnpm run ${script}${suffix}`;
    case "yarn":
      return `yarn ${script}${suffix}`;
    default:
      return `npm run ${script}${suffix}`;
  }
}

export function getStartCommand(
  framework: PreviewFramework,
  pkg: PackageJsonShape | null,
  port: number,
  pm: PreviewPackageManager = "npm"
): { command: string; needsBuild: boolean } {
  const scripts = pkg?.scripts ?? {};

  switch (framework) {
    case "nextjs":
      return {
        command: `nohup ${pmRun(pm, "dev", `--hostname 0.0.0.0 --port ${port}`)} > /tmp/preview-runtime.log 2>&1 &`,
        needsBuild: false,
      };
    case "vite":
      return {
        command: `nohup ${pmRun(pm, "dev", `--host 0.0.0.0 --port ${port}`)} > /tmp/preview-runtime.log 2>&1 &`,
        needsBuild: false,
      };
    case "express":
    case "node":
      if (scripts.dev) {
        return {
          command: `nohup PORT=${port} ${pmRun(pm, "dev")} > /tmp/preview-runtime.log 2>&1 &`,
          needsBuild: false,
        };
      }
      if (scripts.start) {
        return {
          command: `nohup PORT=${port} ${pmRun(pm, "start")} > /tmp/preview-runtime.log 2>&1 &`,
          needsBuild: !!scripts.build,
        };
      }
      return {
        command: `nohup PORT=${port} node index.js > /tmp/preview-runtime.log 2>&1 &`,
        needsBuild: false,
      };
    default:
      return {
        command: `nohup ${pmRun(pm, "dev", `--hostname 0.0.0.0 --port ${port}`)} > /tmp/preview-runtime.log 2>&1 &`,
        needsBuild: false,
      };
  }
}

export function getBuildCommand(
  pkg: PackageJsonShape | null,
  pm: PreviewPackageManager = "npm"
): string | null {
  if (!pkg?.scripts?.build) return null;
  return `${pmRun(pm, "build")} 2>&1`;
}
