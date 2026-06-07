/**
 * Verifies retryable vs non-retryable error classification.
 */
import {
  AgentError,
  NonRetryableErrorCodes,
  isRetryableError,
} from "@nebula/shared";

interface Case {
  name: string;
  err: unknown;
  expectRetryable: boolean;
}

const cases: Case[] = [
  {
    name: "NO_SPEC",
    err: new AgentError(NonRetryableErrorCodes.NO_SPEC, "no spec", 400, false),
    expectRetryable: false,
  },
  {
    name: "VALIDATION_ERROR",
    err: new AgentError(NonRetryableErrorCodes.VALIDATION_ERROR, "bad path", 400, false),
    expectRetryable: false,
  },
  {
    name: "AUTH_ERROR",
    err: new AgentError(NonRetryableErrorCodes.AUTH_ERROR, "auth failed", 401, false),
    expectRetryable: false,
  },
  {
    name: "CONFIGURATION_ERROR",
    err: new AgentError(NonRetryableErrorCodes.CONFIGURATION_ERROR, "no key", 503, false),
    expectRetryable: false,
  },
  {
    name: "Anthropic 429",
    err: { status: 429, message: "rate limited" },
    expectRetryable: true,
  },
  {
    name: "Anthropic 500",
    err: { status: 500, message: "server error" },
    expectRetryable: true,
  },
  {
    name: "Anthropic 502",
    err: { status: 502, message: "bad gateway" },
    expectRetryable: true,
  },
  {
    name: "Network ECONNRESET",
    err: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
    expectRetryable: true,
  },
  {
    name: "Network ETIMEDOUT",
    err: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
    expectRetryable: true,
  },
  {
    name: "BUILD_INCOMPLETE",
    err: new AgentError(NonRetryableErrorCodes.BUILD_INCOMPLETE, "missing page", 422, true),
    expectRetryable: false,
  },
  {
    name: "VFS_WRITE_ERROR",
    err: new AgentError(NonRetryableErrorCodes.VFS_WRITE_ERROR, "encoding", 500, false),
    expectRetryable: false,
  },
  {
    name: "PHASE_WRITE_FAILED",
    err: new AgentError(NonRetryableErrorCodes.PHASE_WRITE_FAILED, "phase data", 500, false),
    expectRetryable: false,
  },
  {
    name: "AgentError with retryable=true flag",
    err: new AgentError("PROVIDER_ERROR", "transient", 503, true),
    expectRetryable: false,
  },
  {
    name: "Generic build failure",
    err: new Error("Builder completed but no files were written"),
    expectRetryable: false,
  },
  {
    name: "Transient DB pool timeout",
    err: new Error("connection pool timeout"),
    expectRetryable: true,
  },
];

let passed = 0;
let failed = 0;

console.log("Retry Classification Verification\n");

for (const c of cases) {
  const retryable = isRetryableError(c.err);
  const ok = retryable === c.expectRetryable;
  const icon = ok ? "PASS" : "FAIL";
  console.log(
    `[${icon}] ${c.name}: retryable=${retryable} (expected ${c.expectRetryable})`
  );
  if (ok) passed++;
  else failed++;
}

console.log(`\n--- ${passed}/${cases.length} passed ---`);
process.exit(failed > 0 ? 1 : 0);
