import {
  AgentError,
  NonRetryableErrorCodes,
  isRetryableError,
} from "@nebula/shared";
import type {
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMProvider,
  LLMToolCall,
} from "@nebula/shared";
import { env } from "../../config/env";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  private requireKey(): string {
    if (!env.OPENAI_API_KEY) {
      throw new AgentError(
        NonRetryableErrorCodes.CONFIGURATION_ERROR,
        "OPENAI_API_KEY is not configured",
        503,
        false
      );
    }
    return env.OPENAI_API_KEY;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    try {
      const messages = [
        { role: "system" as const, content: options.system },
        ...options.messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : m.content.some((b) => b.type === "image")
                ? m.content.map((b) =>
                    b.type === "image"
                      ? {
                          type: "image_url" as const,
                          image_url: {
                            url: `data:${b.mediaType};base64,${b.data}`,
                          },
                        }
                      : {
                          type: "text" as const,
                          text:
                            b.type === "text" ? b.text : JSON.stringify(b),
                        }
                  )
                : JSON.stringify(m.content),
        })),
      ];

      const body: Record<string, unknown> = {
        model: env.OPENAI_MODEL,
        max_tokens: options.maxTokens ?? 8192,
        temperature: options.temperature ?? 0,
        messages,
      };

      if (options.tools?.length) {
        body.tools = options.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));
        if (options.forcedToolName) {
          body.tool_choice = {
            type: "function",
            function: { name: options.forcedToolName },
          };
        }
      }

      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.requireKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as OpenAIResponse;
      if (!res.ok) {
        throw new Error(data.error?.message ?? `OpenAI HTTP ${res.status}`);
      }

      const choice = data.choices?.[0];
      const toolCalls: LLMToolCall[] =
        choice?.message?.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || "{}") as Record<
            string,
            unknown
          >,
        })) ?? [];

      return {
        content: choice?.message?.content ?? "",
        toolCalls,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        stopReason: choice?.finish_reason ?? "stop",
      };
    } catch (err) {
      if (err instanceof AgentError) throw err;
      const message = err instanceof Error ? err.message : "OpenAI request failed";
      throw new AgentError(
        "PROVIDER_ERROR",
        message,
        500,
        isRetryableError(err)
      );
    }
  }
}
