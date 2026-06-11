import { AgentError, NonRetryableErrorCodes } from "@nebula/shared";
import { acquireRedisLock, releaseRedisLock } from "./redis-lock";

/** Prevents concurrent agent runs per project (Redis when available). */
export class ProjectLock {
  private active = new Set<string>();

  constructor(private readonly label: string) {}

  private lockKey(projectId: string) {
    return `lock:${this.label}:${projectId}`;
  }

  async tryAcquire(projectId: string): Promise<void> {
    const inProgressError = () =>
      new AgentError(
        this.label === "clarifier"
          ? NonRetryableErrorCodes.CLARIFIER_IN_PROGRESS
          : NonRetryableErrorCodes.BUILD_IN_PROGRESS,
        `${this.label} already in progress for this project`,
        409,
        false
      );

    if (this.active.has(projectId)) {
      throw inProgressError();
    }
    this.active.add(projectId);

    // Cross-instance guard — must be enforced BEFORE the run starts,
    // otherwise two API instances can build the same project concurrently.
    const ok = await acquireRedisLock(this.lockKey(projectId));
    if (!ok) {
      this.active.delete(projectId);
      throw inProgressError();
    }
  }

  release(projectId: string): void {
    this.active.delete(projectId);
    void releaseRedisLock(this.lockKey(projectId));
  }

  isActive(projectId: string): boolean {
    return this.active.has(projectId);
  }
}
