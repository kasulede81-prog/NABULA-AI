import { z } from "zod";
import { vfsPathSchema } from "@nebula/shared";
import { resolveLLMProvider } from "../providers/llm";
import { projectService } from "./project.service";

export const terminalCommandSchema = z.object({
  instruction: z.string().min(1).max(2000),
});

export const quickFixSchema = z.object({
  path: vfsPathSchema,
  content: z.string().max(1_000_000),
  errors: z
    .array(
      z.object({
        line: z.number().int().min(1),
        message: z.string().max(1000),
      })
    )
    .min(1)
    .max(30),
});

const TERMINAL_SYSTEM = `You generate shell commands for a Linux sandbox running a Node.js/Next.js project (pnpm available).
Given the user's request, output ONLY the shell command — no markdown, no explanation, no leading $.
If multiple commands are needed, join with &&.
Never output destructive commands (rm -rf /, mkfs, dd, fork bombs).`;

const QUICKFIX_SYSTEM = `You are an expert code fixer. The user provides a file and its compiler/linter errors.
Fix ALL the listed errors with minimal changes. Preserve formatting and intent.
Return ONLY the complete corrected file content. No markdown fences, no commentary.`;

const FORBIDDEN_COMMANDS =
  /rm\s+(-\w*r\w*f|-\w*f\w*r)\w*\s+[/~]|mkfs|:\(\)\s*\{|dd\s+if=|>\s*\/dev\/sd|chmod\s+(-R\s+)?777\s+\/|curl[^|]*\|\s*(ba)?sh|wget[^|]*\|\s*(ba)?sh|shutdown|reboot\b/i;

export class AiAssistService {
  async terminalCommand(
    projectId: string,
    userId: string,
    instruction: string
  ): Promise<{ command: string }> {
    await projectService.get(projectId, userId);
    const llm = resolveLLMProvider();
    const result = await llm.generate({
      system: TERMINAL_SYSTEM,
      messages: [{ role: "user", content: instruction }],
      maxTokens: 300,
      temperature: 0,
    });
    let command = result.content.trim();
    const fence = /^```[\w-]*\n?([\s\S]*?)```$/m.exec(command);
    if (fence) command = fence[1].trim();
    command = command.replace(/^\$\s*/, "").split("\n")[0].trim();
    if (!command || FORBIDDEN_COMMANDS.test(command)) {
      return { command: "" };
    }
    return { command };
  }

  async quickFix(
    projectId: string,
    userId: string,
    input: z.infer<typeof quickFixSchema>
  ): Promise<{ content: string }> {
    await projectService.get(projectId, userId);
    const llm = resolveLLMProvider();
    const errorList = input.errors
      .map((e) => `- Line ${e.line}: ${e.message}`)
      .join("\n");
    const result = await llm.generate({
      system: QUICKFIX_SYSTEM,
      messages: [
        {
          role: "user",
          content: `File: ${input.path}

Errors to fix:
${errorList}

File content:
${input.content}`,
        },
      ],
      maxTokens: 16_000,
      temperature: 0,
    });
    let content = result.content.trim();
    const fence = /^```[\w-]*\n?([\s\S]*?)```$/m.exec(content);
    if (fence) content = fence[1].trimEnd();
    return { content: content || input.content };
  }
}

export const aiAssistService = new AiAssistService();
