import { z } from "zod";

export const llmProviderSchema = z.enum(["anthropic", "deepseek"]);

export type LlmProviderId = z.infer<typeof llmProviderSchema>;

export const llmProviderLabels: Record<LlmProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  deepseek: "DeepSeek",
};
