import type { LLMProviderId } from "../types/llm";

export interface LlmCostRates {
  inputPerM: number;
  outputPerM: number;
}

/** USD per 1M tokens — estimates for analytics only. */
export const LLM_COST_RATES: Record<LLMProviderId, LlmCostRates> = {
  deepseek: { inputPerM: 0.27, outputPerM: 1.1 },
  anthropic: { inputPerM: 3.0, outputPerM: 15.0 },
};

export function estimateLlmCostUsd(
  provider: LLMProviderId,
  tokensInput: number,
  tokensOutput: number
): number {
  const rates = LLM_COST_RATES[provider];
  return (
    (tokensInput / 1_000_000) * rates.inputPerM +
    (tokensOutput / 1_000_000) * rates.outputPerM
  );
}
