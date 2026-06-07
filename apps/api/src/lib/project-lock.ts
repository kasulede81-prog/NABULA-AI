import { AgentError, NonRetryableErrorCodes } from "@nebula/shared";

/** Prevents concurrent agent runs per project. */
export class ProjectLock {
  private active = new Set<string>();

  constructor(private readonly label: string) {}

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
  }

  release(projectId: string): void {
    this.active.delete(projectId);
  }

  isActive(projectId: string): boolean {
    return this.active.has(projectId);
  }
}
