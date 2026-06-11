import {

  AgentError,

  NonRetryableErrorCodes,

  isRetryableError,

  normalizeWriteFilesInput,

} from "@nebula/shared";

import type {

  LLMGenerateOptions,

  LLMGenerateResult,

  LLMMessage,

  LLMProvider,

  LLMToolCall,

  LLMToolDefinition,

} from "@nebula/shared";

import { env } from "../../config/env";



const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";

const DIAGNOSTIC_CONTENT_CHARS = 300;



interface DeepSeekToolCall {

  id: string;

  type: "function";

  function: { name: string; arguments: string };

}



interface DeepSeekChatResponse {

  choices?: Array<{

    message?: {

      content?: string | null;

      tool_calls?: DeepSeekToolCall[];

    };

    finish_reason?: string;

  }>;

  usage?: {

    prompt_tokens?: number;

    completion_tokens?: number;

  };

  error?: {

    message?: string;

    type?: string;

    code?: string;

  };

}



export interface ParseDeepSeekOptions {

  recoverFromContent?: boolean;

}



export interface EmptyToolCallDiagnostic {

  provider: string;

  phase?: string;

  finishReason: string;

  contentPreview: string;

}



function wrapDeepSeekError(err: unknown, status?: number): AgentError {

  if (err instanceof AgentError) return err;



  if (status === 401 || status === 403) {

    return new AgentError(

      NonRetryableErrorCodes.AUTH_ERROR,

      "DeepSeek API authentication failed",

      status,

      false

    );

  }



  const message = err instanceof Error ? err.message : "DeepSeek API request failed";

  const retryable = isRetryableError({ status, message });



  return new AgentError("PROVIDER_ERROR", message, status ?? 500, retryable);

}



/** Map Nebula tool definitions to OpenAI-compatible function tools. */

export function mapToolsToOpenAI(tools: LLMToolDefinition[]) {

  return tools.map((tool) => ({

    type: "function" as const,

    function: {

      name: tool.name,

      description: tool.description,

      parameters: tool.inputSchema,

    },

  }));

}



/** Map Nebula messages to DeepSeek/OpenAI chat messages. */

export function mapMessagesToOpenAI(

  system: string,

  messages: LLMMessage[]

): Array<{ role: string; content: string }> {

  const mapped: Array<{ role: string; content: string }> = [

    { role: "system", content: system },

  ];



  for (const message of messages) {

    const content =

      typeof message.content === "string"

        ? message.content

        : message.content

            .map((block) =>
              block.type === "text"
                ? block.text
                : block.type === "image"
                  ? "[Image attached — DeepSeek does not support image input]"
                  : ""
            )

            .filter(Boolean)

            .join("\n");



    mapped.push({ role: message.role, content });

  }



  return mapped;

}



export function parseToolCallArguments(argumentsJson: string): Record<string, unknown> {

  try {

    const parsed = JSON.parse(argumentsJson) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {

      return parsed as Record<string, unknown>;

    }

    return {};

  } catch {

    return {};

  }

}



/** Resolve DeepSeek tool_choice for builder phases. */

export function resolveDeepSeekToolChoice(

  tools: LLMToolDefinition[] | undefined,

  forcedToolName?: string

): "required" | { type: "function"; function: { name: string } } | undefined {

  if (!tools?.length) return undefined;

  if (forcedToolName) {

    return { type: "function", function: { name: forcedToolName } };

  }

  return "required";

}



function normalizeMessageContent(content: string | null | undefined): string {

  if (typeof content === "string") return content;

  return "";

}



function parseStructuredToolCalls(
  message?: { tool_calls?: DeepSeekToolCall[] }
): LLMToolCall[] {

  const toolCalls: LLMToolCall[] = [];

  for (const call of message?.tool_calls ?? []) {

    if (call.type !== "function") continue;

    toolCalls.push({

      id: call.id,

      name: call.function.name,

      input: parseToolCallArguments(call.function.arguments),

    });

  }

  return toolCalls;

}



/** Extract a write_files JSON object from assistant content text. */

export function extractWriteFilesPayloadFromContent(content: string): Record<string, unknown> | null {

  const trimmed = content.trim();

  if (!trimmed) return null;



  const candidates: string[] = [];



  const named = trimmed.match(/write_files\s*[:\n]*\s*(\{[\s\S]*\})/i);

  if (named?.[1]) candidates.push(named[1]);



  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (codeBlock?.[1]) candidates.push(codeBlock[1].trim());



  const filesObject = trimmed.match(/\{[\s\S]*"files"[\s\S]*\}/);

  if (filesObject?.[0]) candidates.push(filesObject[0]);



  for (const candidate of candidates) {

    try {

      const parsed = JSON.parse(candidate) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {

        return parsed as Record<string, unknown>;

      }

    } catch {

      /* try next candidate */

    }

  }



  return null;

}



/** Recover write_files tool calls embedded in plain content. */

export function recoverToolCallsFromContent(content: string): LLMToolCall[] {

  const payload = extractWriteFilesPayloadFromContent(content);

  if (!payload) return [];



  const normalized = normalizeWriteFilesInput(payload);

  if (normalized.files.length === 0) return [];



  return [

    {

      id: `recovered_${Date.now()}`,

      name: "write_files",

      input: { files: normalized.files },

    },

  ];

}



export function logEmptyStructuredToolCalls(diagnostic: EmptyToolCallDiagnostic): void {

  console.debug(

    "[deepseek] tools requested but structured tool_calls empty",

    JSON.stringify(diagnostic)

  );

}



/** Parse a DeepSeek chat completion response into Nebula LLM result shape. */

export function parseDeepSeekResponse(

  data: DeepSeekChatResponse,

  options: ParseDeepSeekOptions = {}

): LLMGenerateResult {

  const choice = data.choices?.[0];

  const message = choice?.message;

  const content = normalizeMessageContent(message?.content);



  const structuredToolCalls = parseStructuredToolCalls(message);

  let toolCalls = structuredToolCalls;

  let recoveredFromContent = false;



  if (options.recoverFromContent && toolCalls.length === 0 && content) {

    const recovered = recoverToolCallsFromContent(content);

    if (recovered.length > 0) {

      toolCalls = recovered;

      recoveredFromContent = true;

    }

  }



  return {

    content,

    toolCalls,

    inputTokens: data.usage?.prompt_tokens ?? 0,

    outputTokens: data.usage?.completion_tokens ?? 0,

    stopReason: choice?.finish_reason ?? "stop",

    hadStructuredToolCalls: structuredToolCalls.length > 0,

    recoveredFromContent,

  };

}



export class DeepSeekProvider implements LLMProvider {

  readonly name = "deepseek";

  private readonly apiKey: string;



  constructor(apiKey: string = env.DEEPSEEK_API_KEY) {

    this.apiKey = apiKey;

  }



  private requireApiKey(): string {

    if (!this.apiKey) {

      throw new AgentError(

        NonRetryableErrorCodes.CONFIGURATION_ERROR,

        "DEEPSEEK_API_KEY is not configured",

        503,

        false

      );

    }

    return this.apiKey;

  }



  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {

    const apiKey = this.requireApiKey();



    const body: Record<string, unknown> = {

      model: env.DEEPSEEK_MODEL,

      messages: mapMessagesToOpenAI(options.system, options.messages),

      max_tokens: options.maxTokens ?? 8192,

      temperature: options.temperature ?? 0,

    };



    const toolChoice = resolveDeepSeekToolChoice(options.tools, options.forcedToolName);

    if (toolChoice && options.tools?.length) {

      body.tools = mapToolsToOpenAI(options.tools);

      body.tool_choice = toolChoice;

    }



    try {

      const response = await fetch(DEEPSEEK_CHAT_URL, {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${apiKey}`,

        },

        body: JSON.stringify(body),

      });



      const data = (await response.json()) as DeepSeekChatResponse;



      if (!response.ok) {

        const detail = data.error?.message ?? response.statusText;

        throw wrapDeepSeekError(new Error(detail), response.status);

      }



      if (data.error?.message) {

        throw wrapDeepSeekError(new Error(data.error.message), response.status);

      }



      const withoutRecovery = parseDeepSeekResponse(data, { recoverFromContent: false });



      if (options.tools?.length && !withoutRecovery.hadStructuredToolCalls) {

        logEmptyStructuredToolCalls({

          provider: this.name,

          phase: options.phase,

          finishReason: withoutRecovery.stopReason,

          contentPreview: withoutRecovery.content.slice(0, DIAGNOSTIC_CONTENT_CHARS),

        });

      }



      return parseDeepSeekResponse(data, {

        recoverFromContent: Boolean(options.tools?.length),

      });

    } catch (err) {

      if (err instanceof AgentError) throw err;

      throw wrapDeepSeekError(err);

    }

  }

}


