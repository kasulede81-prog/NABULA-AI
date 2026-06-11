import { env } from "./env";

export type LLMProviderId = "anthropic" | "deepseek" | "openai" | "gemini";

export function getActiveLLMProviderId(): LLMProviderId {
  return env.LLM_PROVIDER;
}

export function isProviderApiKeyConfigured(
  provider: LLMProviderId,
  keys: {
    anthropic: string;
    deepseek: string;
    openai: string;
    gemini: string;
  }
): boolean {
  switch (provider) {
    case "deepseek":
      return keys.deepseek.length > 0;
    case "openai":
      return keys.openai.length > 0;
    case "gemini":
      return keys.gemini.length > 0;
    case "anthropic":
    default:
      return keys.anthropic.length > 0;
  }
}

export function isLLMProviderConfigured(
  provider: LLMProviderId = env.LLM_PROVIDER
): boolean {
  return isProviderApiKeyConfigured(provider, {
    anthropic: env.ANTHROPIC_API_KEY,
    deepseek: env.DEEPSEEK_API_KEY,
    openai: env.OPENAI_API_KEY,
    gemini: env.GEMINI_API_KEY,
  });
}
