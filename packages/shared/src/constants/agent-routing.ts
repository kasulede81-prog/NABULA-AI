import type { AgentType, LLMProvider } from "../types/agent";

export interface ModelAssignment {
  provider: LLMProvider;
  model: string;
  reason: string;
}

/**
 * Default model routing per agent type.
 * Override via model_routing_config per project.
 */
export const DEFAULT_AGENT_ROUTING: Record<AgentType, ModelAssignment> = {
  requirements: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  planning: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  architecture: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  ui_generation: {
    provider: "openai",
    model: "gpt-4o",
    reason: "default",
  },
  backend_generation: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  database: {
    provider: "deepseek",
    model: "deepseek-coder",
    reason: "default",
  },
  testing: {
    provider: "deepseek",
    model: "deepseek-coder",
    reason: "default",
  },
  refactoring: {
    provider: "google",
    model: "gemini-2.0-flash",
    reason: "default",
  },
  deployment: {
    provider: "deepseek",
    model: "deepseek-coder",
    reason: "default",
  },
  github: {
    provider: "anthropic", // unused — deterministic API ops
    model: "none",
    reason: "no_llm",
  },
  review: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  // Phase 1 legacy types
  planner: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  coding: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  reviewer: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    reason: "default",
  },
  debugger: {
    provider: "google",
    model: "gemini-2.0-flash",
    reason: "default",
  },
};

export const FALLBACK_CHAINS: Record<LLMProvider, LLMProvider[]> = {
  anthropic: ["openai", "google", "deepseek"],
  openai: ["anthropic", "google", "deepseek"],
  google: ["deepseek", "openai", "anthropic"],
  deepseek: ["google", "openai", "anthropic"],
};
