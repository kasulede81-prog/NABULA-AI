import Anthropic from "@anthropic-ai/sdk";
import {
  AgentError,
  NonRetryableErrorCodes,
  isRetryableError,
} from "@nebula/shared";
import type {
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMMessage,
  LLMProvider,
  LLMStreamChunk,
  LLMToolCall,
} from "@nebula/shared";
import { env } from "../../config/env";

type AnthropicMessageContent =
  Anthropic.MessageCreateParams["messages"][0]["content"];

function toAnthropicContent(m: LLMMessage): AnthropicMessageContent {
  if (typeof m.content === "string") return m.content;
  return m.content.map((block) => {
    if (block.type === "image") {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: block.mediaType as
            | "image/png"
            | "image/jpeg"
            | "image/webp"
            | "image/gif",
          data: block.data,
        },
      };
    }
    return block;
  }) as AnthropicMessageContent;
}

function wrapAnthropicError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;

  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: unknown }).status)
      : undefined;

  if (status === 401 || status === 403) {
    return new AgentError(
      NonRetryableErrorCodes.AUTH_ERROR,
      "Anthropic API authentication failed",
      status,
      false
    );
  }

  const message = err instanceof Error ? err.message : "Anthropic API request failed";
  const retryable = isRetryableError(err);

  return new AgentError(
    retryable ? "PROVIDER_ERROR" : "PROVIDER_ERROR",
    message,
    status ?? 500,
    retryable
  );
}

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private client: Anthropic | null = null;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      return;
    }
    this.client = new Anthropic({ apiKey });
  }

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new AgentError(
        NonRetryableErrorCodes.CONFIGURATION_ERROR,
        "ANTHROPIC_API_KEY is not configured",
        503,
        false
      );
    }
    return this.client;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    try {
      const client = this.requireClient();
      const response = await client.messages.create({
        model: env.CLAUDE_MODEL,
        max_tokens: options.maxTokens ?? 8192,
        temperature: options.temperature ?? 0,
        system: options.system,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: toAnthropicContent(m),
        })),
        tools: options.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
      });

      let content = "";
      const toolCalls: LLMToolCall[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content,
        toolCalls,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason ?? "end_turn",
      };
    } catch (err) {
      throw wrapAnthropicError(err);
    }
  }

  async *stream(options: LLMGenerateOptions): AsyncIterable<LLMStreamChunk> {
    const client = this.requireClient();
    try {
      const stream = await client.messages.stream({
        model: env.CLAUDE_MODEL,
        max_tokens: options.maxTokens ?? 8192,
        temperature: options.temperature ?? 0,
        system: options.system,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: toAnthropicContent(m),
        })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield {
        type: "done",
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      };
    } catch (err) {
      throw wrapAnthropicError(err);
    }
  }
}
