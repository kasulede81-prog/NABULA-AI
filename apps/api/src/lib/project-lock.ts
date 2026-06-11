import { AgentError, NonRetryableErrorCodes } from "@nebula/shared";
import { acquireRedisLock, releaseRedisLock } from "./redis-lock";

/** Prevents concurrent agent runs per project (Redis when available). */
export class ProjectLock {
  private active = new Set<string>();

  constructor(private readonly label: string) {}

  private lockKey(projectId: string) {
    return `lock:${this.label}:${projectId}`;
  }

  tryAcquire(projectId: string): void {
    if (this.active.has(projectId)) {
      throw new AgentError(
        this.label === "clarifier"
          ? NonRetryableErrorCodes.CLARIFIER_IN_PROGRESS
          : NonRetryableErrorCodes.BUILD_IN_PROGRESS,
        `${this.label} already in progress for this project`,
        409,
        false
      );
    }
    this.active.add(projectId);
    void acquireRedisLock(this.lockKey(projectId)).then((ok) => {
      if (!ok) {
        this.active.delete(projectId);
      }
    });
  }

  release(projectId: string): void {
    this.active.delete(projectId);
    void releaseRedisLock(this.lockKey(projectId));
  }

  isActive(projectId: string): boolean {
    return this.active.has(projectId);
  }
}
