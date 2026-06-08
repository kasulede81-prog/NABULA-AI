import type { PreviewFramework } from "@nebula/shared";
import type { PackageJsonShape } from "./preview-framework";

export const COMMON_PREVIEW_PORTS = [3000, 3001, 5173, 4173, 8080, 4000] as const;

export function defaultPortForFramework(framework: PreviewFramework): number {
  switch (framework) {
    case "vite":
      return 5173;
    case "nextjs":
    case "express":
    case "node":
      return 3000;
    default:
      return 3000;
  }
}

export function extractPortFromScript(script: string | undefined): number | null {
  if (!script) return null;
  const portFlag = script.match(/--port\s+(\d+)/);
  if (portFlag) return Number(portFlag[1]);
  const portEq = script.match(/PORT=(\d+)/);
  if (portEq) return Number(portEq[1]);
  const listen = script.match(/listen\((\d+)/);
  if (listen) return Number(listen[1]);
  return null;
}

export function resolveTargetPort(
  framework: PreviewFramework,
  pkg: PackageJsonShape | null
): number {
  const scripts = pkg?.scripts ?? {};
  const fromDev = extractPortFromScript(scripts.dev);
  if (fromDev) return fromDev;
  const fromStart = extractPortFromScript(scripts.start);
  if (fromStart) return fromStart;
  return defaultPortForFramework(framework);
}

export function portsToProbe(primaryPort: number): number[] {
  const set = new Set<number>([primaryPort, ...COMMON_PREVIEW_PORTS]);
  return [...set];
}

export function extractPortFromLogLine(line: string): number | null {
  const patterns = [
    /localhost:(\d+)/i,
    /127\.0\.0\.1:(\d+)/,
    /http:\/\/0\.0\.0\.0:(\d+)/i,
    /port\s+(\d{4,5})/i,
    /:(\d{4,5})\s/,
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const port = Number(match[1]);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}
