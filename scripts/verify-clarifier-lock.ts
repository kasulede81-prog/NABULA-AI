/**
 * Verifies clarifier concurrency lock prevents duplicate runs per project.
 */
import { ProjectLock } from "../apps/api/src/lib/project-lock";
import { NonRetryableErrorCodes, AgentError } from "@nebula/shared";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log("Clarifier Lock Verification\n");

const lock = new ProjectLock("clarifier");
const projectId = "test-project-id";

// Acquire once
lock.tryAcquire(projectId);
assert(lock.isActive(projectId), "lock should be active after acquire");
console.log("[PASS] First acquire succeeds");

// Second acquire should throw
let blocked = false;
try {
  lock.tryAcquire(projectId);
} catch (err) {
  blocked =
    err instanceof AgentError &&
    err.code === NonRetryableErrorCodes.CLARIFIER_IN_PROGRESS;
}
assert(blocked, "second acquire should throw CLARIFIER_IN_PROGRESS");
console.log("[PASS] Second acquire blocked with CLARIFIER_IN_PROGRESS");

// Release and re-acquire
lock.release(projectId);
assert(!lock.isActive(projectId), "lock should be inactive after release");
lock.tryAcquire(projectId);
assert(lock.isActive(projectId), "lock should be active after re-acquire");
console.log("[PASS] Re-acquire after release succeeds");

lock.release(projectId);

// Different project should not conflict
const lock2 = new ProjectLock("clarifier");
lock2.tryAcquire("other-project");
assert(lock2.isActive("other-project"), "different project should acquire independently");
console.log("[PASS] Independent project locks do not conflict");

console.log("\n--- 4/4 checks passed ---");
