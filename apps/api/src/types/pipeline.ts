import type { LLMProviderId } from "@nebula/shared";

export interface PipelineRunOptions {
  userMessage?: string;
  llmProvider?: LLMProviderId;
}
