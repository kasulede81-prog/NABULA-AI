/** Non-retryable agent/build error codes. */
export const NonRetryableErrorCodes = {
  NO_SPEC: "NO_SPEC",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  VFS_WRITE_ERROR: "VFS_WRITE_ERROR",
  PHASE_WRITE_FAILED: "PHASE_WRITE_FAILED",
  BUILD_INCOMPLETE: "BUILD_INCOMPLETE",
  AUTH_ERROR: "AUTH_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  BUILD_IN_PROGRESS: "BUILD_IN_PROGRESS",
  CLARIFIER_IN_PROGRESS: "CLARIFIER_IN_PROGRESS",
  BUILD_LIMIT_REACHED: "BUILD_LIMIT_REACHED",
} as const;

export type NonRetryableErrorCode =
  (typeof NonRetryableErrorCodes)[keyof typeof NonRetryableErrorCodes];

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export function isNonRetryableCode(code: string): boolean {
  return Object.values(NonRetryableErrorCodes).includes(
    code as NonRetryableErrorCode
  );
}

/** Retry only transient provider/network failures — never validation or VFS errors. */
export function isRetryableError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code && isNonRetryableCode(code)) {
    return false;
  }

  if (err instanceof AgentError) {
    return false;
  }

  if (isAnthropicRetryable(err)) {
    return true;
  }

  if (isNetworkError(err)) {
    return true;
  }

  if (isTransientInfraError(err)) {
    return true;
  }

  return false;
}

function isTransientInfraError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("connection pool timeout") ||
    message.includes("can't reach database server") ||
    message.includes("too many connections")
  );
}

export function getErrorCode(err: unknown): string | undefined {
  if (err instanceof AgentError) return err.code;
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const retryableCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
  ];
  if (retryableCodes.includes(code)) return true;

  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up")
  );
}

function isAnthropicRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const status =
    "status" in err
      ? Number((err as { status: unknown }).status)
      : "statusCode" in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : undefined;

  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status < 600) return true;

  return false;
}
