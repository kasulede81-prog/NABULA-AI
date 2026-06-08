import { PreviewErrorCodes } from "@nebula/shared";

export interface ClassifiedPreviewError {
  code: string;
  message: string;
  status: number;
}

export function classifyPreviewFailure(
  raw: string,
  context?: { phase?: string | import("@nebula/shared").PreviewPhase }
): ClassifiedPreviewError {
  const message = raw.trim() || "Preview provisioning failed";
  const lower = message.toLowerCase();

  if (lower.includes("e2b") && lower.includes("not configured")) {
    return { code: PreviewErrorCodes.E2B_NOT_CONFIGURED, message, status: 503 };
  }
  if (
    lower.includes("cannot find module") ||
    lower.includes("module not found") ||
    lower.includes("enoent") && lower.includes("node_modules")
  ) {
    return {
      code: PreviewErrorCodes.MISSING_DEPENDENCY,
      message: `Missing dependency detected during ${context?.phase ?? "preview"}. Run install and verify package.json.\n\n${message}`,
      status: 500,
    };
  }
  if (
    lower.includes("environment variable") ||
    lower.includes("env variable") ||
    /process\.env\.[A-Z0-9_]+/.test(message)
  ) {
    return {
      code: PreviewErrorCodes.MISSING_ENV_VAR,
      message: `Missing required environment variable.\n\n${message}`,
      status: 500,
    };
  }
  if (
    lower.includes("eaddrinuse") ||
    lower.includes("address already in use") ||
    lower.includes("port") && lower.includes("in use")
  ) {
    return {
      code: PreviewErrorCodes.PORT_CONFLICT,
      message: `Port conflict while starting the preview server.\n\n${message}`,
      status: 500,
    };
  }
  if (
    lower.includes("prisma") &&
    (lower.includes("migrate") || lower.includes("db push") || lower.includes("schema"))
  ) {
    return {
      code: PreviewErrorCodes.PRISMA_MIGRATION_FAILED,
      message: `Prisma setup failed. Check schema.prisma and database configuration.\n\n${message}`,
      status: 500,
    };
  }
  if (
    lower.includes("build failed") ||
    lower.includes("compilation error") ||
    lower.includes("failed to compile") ||
    context?.phase === "building_project"
  ) {
    return {
      code: PreviewErrorCodes.BUILD_FAILURE,
      message: `Project build failed.\n\n${message}`,
      status: 500,
    };
  }
  if (
    lower.includes("uncaught") ||
    lower.includes("unhandled") ||
    lower.includes("runtime exception") ||
    lower.includes("syntaxerror")
  ) {
    return {
      code: PreviewErrorCodes.RUNTIME_EXCEPTION,
      message: `Runtime exception in preview server.\n\n${message}`,
      status: 500,
    };
  }
  if (lower.includes("did not become ready") || lower.includes("health check")) {
    return {
      code: PreviewErrorCodes.HEALTH_CHECK_TIMEOUT,
      message: `Server did not respond with HTTP 200 within 60 seconds. Check runtime logs for startup errors.\n\n${message}`,
      status: 500,
    };
  }

  return { code: PreviewErrorCodes.PREVIEW_FAILED, message, status: 500 };
}
