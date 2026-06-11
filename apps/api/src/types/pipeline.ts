import type { LLMProviderId } from "@nebula/shared";

export interface PipelineRunOptions {
  userMessage?: string;
  llmProvider?: LLMProviderId;
  /** When true, builder stages file writes for user review instead of applying immediately. */
  deferWrites?: boolean;
}
