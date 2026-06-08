export const SseEvents = {
  CONNECTED: "connected",
  MESSAGE_CREATED: "message.created",
  FILE_CREATED: "file.created",
  FILE_UPDATED: "file.updated",
  FILE_DELETED: "file.deleted",
  PROGRESS: "progress",
  PROJECT_UPDATED: "project.updated",
  AGENT_STARTED: "agent.started",
  AGENT_PROGRESS: "agent.progress",
  AGENT_COMPLETED: "agent.completed",
  AGENT_FAILED: "agent.failed",
  BUILD_STARTED: "build.started",
  BUILD_COMPLETED: "build.completed",
  BUILD_FAILED: "build.failed",
  BUILD_LIMIT_REACHED: "build.limit_reached",
  DEEPSEEK_TOOL_RECOVERY: "deepseek_tool_recovery",
  PREVIEW_STARTED: "preview.started",
  PREVIEW_PHASE: "preview.phase",
  PREVIEW_LOG: "preview.log",
  PREVIEW_READY: "preview.ready",
  PREVIEW_FAILED: "preview.failed",
  PREVIEW_DELETED: "preview.deleted",
  PREVIEW_EXPIRED: "preview.expired",
  GITHUB_EXPORT_STARTED: "github.export.started",
  GITHUB_EXPORT_COMPLETED: "github.export.completed",
  GITHUB_EXPORT_FAILED: "github.export.failed",
} as const;

export type SseEventType = (typeof SseEvents)[keyof typeof SseEvents];

export interface SseEvent<T = Record<string, unknown>> {
  type: SseEventType;
  data: T;
  timestamp: string;
}
