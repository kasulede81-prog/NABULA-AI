import type { PreviewPackageManager } from "@nebula/shared";

export function detectPackageManager(
  files: Array<{ path: string }>
): PreviewPackageManager {
  const paths = new Set(files.map((f) => f.path));
  if (paths.has("pnpm-lock.yaml")) return "pnpm";
  if (paths.has("yarn.lock")) return "yarn";
  return "npm";
}

export function getInstallCommand(pm: PreviewPackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1";
    case "yarn":
      return "yarn install --frozen-lockfile 2>&1 || yarn install 2>&1";
    default:
      return "npm install 2>&1";
  }
}
