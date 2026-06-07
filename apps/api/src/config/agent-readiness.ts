import { env } from "./env";
import {
  getActiveLLMProviderId,
  isLLMProviderConfigured,
  type LLMProviderId,
} from "./llm-provider";

export interface AgentReadiness {
  ready: boolean;
  provider: LLMProviderId;
  configured: boolean;
  anthropicConfigured: boolean;
  issues: string[];
}

let cached: AgentReadiness | null = null;

export function checkAgentReadiness(): AgentReadiness {
  const issues: string[] = [];
  const provider = getActiveLLMProviderId();
  const configured = isLLMProviderConfigured(provider);
  const anthropicConfigured = env.ANTHROPIC_API_KEY.length > 0;

  if (!configured) {
    const keyName = provider === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY";
    issues.push(`${keyName} is not configured — agent pipeline unavailable`);
  }

  const result: AgentReadiness = {
    ready: issues.length === 0,
    provider,
    configured,
    anthropicConfigured,
    issues,
  };

  cached = result;
  return result;
}

export function getAgentReadiness(): AgentReadiness {
  return cached ?? checkAgentReadiness();
}

export function logAgentReadinessWarning(): void {
  const state = checkAgentReadiness();
  if (!state.ready) {
    console.warn(
      `[agents] WARNING: Agent pipeline is not ready (provider=${state.provider})`
    );
    for (const issue of state.issues) {
      console.warn(`[agents]   - ${issue}`);
    }
  }
}
