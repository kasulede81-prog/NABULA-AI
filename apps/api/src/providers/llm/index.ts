import type { LLMProvider } from "@nebula/shared";
import {
  getActiveLLMProviderId,
  type LLMProviderId,
} from "../../config/llm-provider";
import { ClaudeProvider } from "./claude.provider";
import { DeepSeekProvider } from "./deepseek.provider";

let provider: LLMProvider | null = null;
let providerId: LLMProviderId | null = null;

/** Instantiate provider by runtime id (used by getLLMProvider and tests). */
export function createLLMProviderForId(id: LLMProviderId): LLMProvider {
  switch (id) {
    case "deepseek":
      return new DeepSeekProvider();
    case "anthropic":
    default:
      return new ClaudeProvider();
  }
}

/** Returns the configured LLM provider (Anthropic or DeepSeek). */
export function getLLMProvider(): LLMProvider {
  return resolveLLMProvider();
}

/** Resolve provider for a request, with optional per-message override. */
export function resolveLLMProvider(override?: LLMProviderId): LLMProvider {
  const activeId = override ?? getActiveLLMProviderId();
  if (!override) {
    if (!provider || providerId !== activeId) {
      provider = createLLMProviderForId(activeId);
      providerId = activeId;
    }
    return provider;
  }
  return createLLMProviderForId(activeId);
}

/** For testing or runtime override. */
export function setLLMProvider(instance: LLMProvider): void {
  provider = instance;
  providerId = null;
}

export function resetLLMProvider(): void {
  provider = null;
  providerId = null;
}

export { ClaudeProvider, DeepSeekProvider };
