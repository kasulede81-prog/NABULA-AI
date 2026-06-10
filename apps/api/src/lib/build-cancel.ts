import { AgentError } from "@nebula/shared";

const cancelRequests = new Set<string>();

export function requestBuildCancel(projectId: string) {
  cancelRequests.add(projectId);
}

export function clearBuildCancel(projectId: string) {
  cancelRequests.delete(projectId);
}

export function isBuildCancelRequested(projectId: string) {
  return cancelRequests.has(projectId);
}

export function assertBuildNotCancelled(projectId: string) {
  if (isBuildCancelRequested(projectId)) {
    throw new AgentError("CANCELLED", "Build cancelled by user", 499, false);
  }
}
