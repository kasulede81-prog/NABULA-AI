import {
  AgentError,
  NonRetryableErrorCodes,
  isRetryableError,
} from "@nebula/shared";
import type {
  LLMContentBlock,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMMessage,
  LLMProvider,
  LLMToolCall,
} from "@nebula/shared";
import { env } from "../../config/env";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

/** Gemini rejects JSON Schema keywords it doesn't know; keep a safe subset. */
function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== "object" || schema === null) return { type: "object" };
  const allowed = new Set([
    "type",
    "format",
    "description",
    "nullable",
    "enum",
    "properties",
    "required",
    "items",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(
        value as Record<string, unknown>
      )) {
        props[name] = sanitizeSchema(sub);
      }
      out[key] = props;
    } else if (key === "items") {
      out[key] = sanitizeSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function blockToParts(blocks: LLMContentBlock[]): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push({ text: block.text });
    } else if (block.type === "image") {
      parts.push({
        inlineData: { mimeType: block.mediaType, data: block.data },
      });
    } else if (block.type === "tool_use") {
      parts.push({
        functionCall: { name: block.name, args: block.input },
      });
    } else if (block.type === "tool_result") {
      // Gemini matches function responses by name; tool_use ids carry the name.
      parts.push({
        functionResponse: {
          name: block.tool_use_id.split("::")[0] || "tool",
          response: { result: block.content },
        },
      });
    }
  }
  return parts;
}

function toGeminiContents(messages: LLMMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts:
      typeof m.content === "string"
        ? [{ text: m.content }]
        : blockToParts(m.content),
  }));
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private requireKey(): string {
    if (!env.GEMINI_API_KEY) {
      throw new AgentError(
        NonRetryableErrorCodes.CONFIGURATION_ERROR,
        "GEMINI_API_KEY is not configured",
        503,
        false
      );
    }
    return env.GEMINI_API_KEY;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    try {
      const key = this.requireKey();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${key}`;

      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: options.system }] },
        contents: toGeminiContents(options.messages),
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 8192,
          temperature: options.temperature ?? 0,
        },
      };

      if (options.tools && options.tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: sanitizeSchema(t.inputSchema),
            })),
          },
        ];
        if (options.forcedToolName) {
          body.toolConfig = {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: [options.forcedToolName],
            },
          };
        }
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as GeminiResponse;
      if (!res.ok) {
        throw new Error(data.error?.message ?? `Gemini HTTP ${res.status}`);
      }

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");

      const toolCalls: LLMToolCall[] = [];
      let callIdx = 0;
      for (const part of parts) {
        if (part.functionCall?.name) {
          toolCalls.push({
            // Gemini has no call ids; encode the name so tool_result can map back.
            id: `${part.functionCall.name}::${Date.now()}_${callIdx++}`,
            name: part.functionCall.name,
            input: part.functionCall.args ?? {},
          });
        }
      }

      return {
        content: text,
        toolCalls,
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        stopReason: data.candidates?.[0]?.finishReason ?? "STOP",
        hadStructuredToolCalls: toolCalls.length > 0,
      };
    } catch (err) {
      if (err instanceof AgentError) throw err;
      const message = err instanceof Error ? err.message : "Gemini request failed";
      throw new AgentError(
        "PROVIDER_ERROR",
        message,
        500,
        isRetryableError(err)
      );
    }
  }
}
