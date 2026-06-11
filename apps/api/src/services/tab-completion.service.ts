import { z } from "zod";
import { vfsPathSchema } from "@nebula/shared";
import { env } from "../config/env";
import { isLLMProviderConfigured } from "../config/llm-provider";
import { resolveLLMProvider } from "../providers/llm";
import { projectService } from "./project.service";

export const tabCompletionSchema = z.object({
  path: vfsPathSchema,
  prefix: z.string().max(20_000),
  suffix: z.string().max(10_000).default(""),
  language: z.string().max(40).optional(),
  /** Recent user edits (edit-prediction context, most recent last). */
  recentEdits: z.string().max(3000).optional(),
});

const SYSTEM = `You are a code completion engine (like Cursor Tab).
Given the code before the cursor (PREFIX) and after the cursor (SUFFIX), output ONLY the code to insert at the cursor.
Rules:
- Output raw code only. No markdown fences, no explanations, no quotes.
- Complete the current statement/block naturally; usually 1-5 lines.
- Never repeat text that already exists in PREFIX or SUFFIX.
- If nothing useful can be inserted, output nothing.`;

export class TabCompletionService {
  isEnabled(): boolean {
    return env.TAB_AUTOCOMPLETE_ENABLED && isLLMProviderConfigured();
  }

  async complete(
    projectId: string,
    userId: string,
    input: z.infer<typeof tabCompletionSchema>
  ): Promise<{ completion: string }> {
    if (!this.isEnabled()) return { completion: "" };
    await projectService.get(projectId, userId);

    // Keep the prompt small: completions only need nearby context.
    const prefix = input.prefix.slice(-6_000);
    const suffix = input.suffix.slice(0, 2_000);

    const editsBlock = input.recentEdits?.trim()
      ? `\nRecent edits by the user (most recent last) — use these to predict what comes next:\n${input.recentEdits}\n`
      : "";

    const llm = resolveLLMProvider();
    const result = await llm.generate({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `File: ${input.path}${input.language ? ` (${input.language})` : ""}
${editsBlock}
PREFIX:
${prefix}

SUFFIX:
${suffix}

Code to insert at cursor:`,
        },
      ],
      maxTokens: 256,
      temperature: 0,
    });

    let completion = stripFences(result.content).replace(/\r\n/g, "\n");
    completion = trimSuffixOverlap(completion, suffix);
    if (completion.trim().length === 0) return { completion: "" };
    // Cap runaway outputs to a Cursor-Tab-like size.
    const lines = completion.split("\n");
    if (lines.length > 12) completion = lines.slice(0, 12).join("\n");
    return { completion };
  }
}

function stripFences(text: string): string {
  const t = text.trim();
  const fence = /^```[\w-]*\n?([\s\S]*?)```$/m.exec(t);
  return fence ? fence[1] : t;
}

/** Drop trailing part of the completion that duplicates the start of suffix. */
function trimSuffixOverlap(completion: string, suffix: string): string {
  const s = suffix.trimStart();
  if (!s) return completion;
  for (let len = Math.min(completion.length, 200); len > 2; len--) {
    if (s.startsWith(completion.slice(completion.length - len))) {
      return completion.slice(0, completion.length - len);
    }
  }
  return completion;
}

export const tabCompletionService = new TabCompletionService();
