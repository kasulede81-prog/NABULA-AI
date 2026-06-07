export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentBlock[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMGenerateOptions {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LLMToolDefinition[];
  /** When set, DeepSeek uses tool_choice.function.name (e.g. write_files). */
  forcedToolName?: string;
  /** Builder phase id — used for provider diagnostics only. */
  phase?: string;
}

export interface LLMGenerateResult {
  content: string;
  toolCalls: LLMToolCall[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  /** True when API returned structured tool_calls before any content recovery. */
  hadStructuredToolCalls?: boolean;
  /** True when tool calls were recovered from message content. */
  recoveredFromContent?: boolean;
}

export interface LLMStreamChunk {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: LLMToolCall;
  inputTokens?: number;
  outputTokens?: number;
}

export type LLMProviderId = "anthropic" | "deepseek";

/** Pluggable LLM provider interface (Anthropic Claude, DeepSeek). */
export interface LLMProvider {
  readonly name: string;
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResult>;
  stream?(options: LLMGenerateOptions): AsyncIterable<LLMStreamChunk>;
}
