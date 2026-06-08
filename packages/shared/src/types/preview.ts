export const PreviewPhases = {
  PREPARING_SANDBOX: "preparing_sandbox",
  INSTALLING_DEPENDENCIES: "installing_dependencies",
  BUILDING_PROJECT: "building_project",
  STARTING_SERVER: "starting_server",
  WAITING_FOR_HEALTH_CHECK: "waiting_for_health_check",
  PREVIEW_READY: "preview_ready",
  FAILED: "failed",
} as const;

export type PreviewPhase = (typeof PreviewPhases)[keyof typeof PreviewPhases];

export const PreviewPhaseLabels: Record<PreviewPhase, string> = {
  preparing_sandbox: "Preparing Sandbox",
  installing_dependencies: "Installing Dependencies",
  building_project: "Building Project",
  starting_server: "Starting Server",
  waiting_for_health_check: "Waiting For Health Check",
  preview_ready: "Preview Ready",
  failed: "Failed",
};

export type PreviewFramework =
  | "nextjs"
  | "vite"
  | "express"
  | "node"
  | "unknown";

export type PreviewPackageManager = "npm" | "pnpm" | "yarn";

export type PreviewLogLevel = "info" | "warn" | "error" | "stdout" | "stderr";

export type PreviewLogSource =
  | "system"
  | "install"
  | "build"
  | "runtime"
  | "health";

export interface PreviewLogEntry {
  id: string;
  previewId: string;
  level: PreviewLogLevel;
  source: PreviewLogSource;
  message: string;
  createdAt: string;
}

export interface PreviewStatusResponse {
  id: string;
  projectId: string;
  status: "starting" | "ready" | "stopped" | "error";
  phase: PreviewPhase;
  previewUrl: string | null;
  detectedPort: number | null;
  framework: PreviewFramework | null;
  packageManager: PreviewPackageManager | null;
  errorCode: string | null;
  errorMessage: string | null;
  sandboxId: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  updatedAt: string;
}

export const PreviewErrorCodes = {
  E2B_NOT_CONFIGURED: "E2B_NOT_CONFIGURED",
  PROJECT_NOT_READY: "PROJECT_NOT_READY",
  MISSING_DEPENDENCY: "MISSING_DEPENDENCY",
  MISSING_ENV_VAR: "MISSING_ENV_VAR",
  PORT_CONFLICT: "PORT_CONFLICT",
  PRISMA_MIGRATION_FAILED: "PRISMA_MIGRATION_FAILED",
  BUILD_FAILURE: "BUILD_FAILURE",
  RUNTIME_EXCEPTION: "RUNTIME_EXCEPTION",
  HEALTH_CHECK_TIMEOUT: "HEALTH_CHECK_TIMEOUT",
  PREVIEW_FAILED: "PREVIEW_FAILED",
} as const;
