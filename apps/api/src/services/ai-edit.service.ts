import { vfsPathSchema } from "@nebula/shared";
import { z } from "zod";
import { getLLMProvider } from "../providers/llm";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";
import {
  analyticsService,
  WorkspaceMetricEvents,
} from "./analytics.service";

export const aiEditSchema = z.object({
  path: vfsPathSchema,
  instruction: z.string().min(1).max(4000),
});

const MAX_FILE_BYTES = 1_000_000;

export class AiEditError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class AiEditService {
  async proposeEdit(
    projectId: string,
    userId: string,
    path: string,
    instruction: string
  ) {
    await projectService.get(projectId, userId);
    const file = await vfsService.readFile(projectId, userId, path);

    if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES) {
      throw new AiEditError(
        "FILE_TOO_LARGE",
        "File exceeds 1 MB limit for AI edit",
        413
      );
    }

    await analyticsService.track(
      WorkspaceMetricEvents.AI_EDITS_REQUESTED,
      userId,
      projectId,
      { path }
    );

    const llm = getLLMProvider();
    const result = await llm.generate({
      system: `You are a precise code editor. Apply the user's instruction to the file.
Return ONLY the complete updated file content.
Do not wrap output in markdown fences.
Do not add explanations or commentary.
Preserve formatting and style unless the instruction requires changes.`,
      messages: [
        {
          role: "user",
          content: `File path: ${path}

Instruction: ${instruction}

Current file content:
${file.content}`,
        },
      ],
      maxTokens: 16_000,
      temperature: 0.2,
    });

    const modifiedContent = stripMarkdownFences(result.content.trim());
    if (!modifiedContent) {
      throw new AiEditError(
        "EMPTY_RESPONSE",
        "AI returned empty content",
        502
      );
    }

    if (Buffer.byteLength(modifiedContent, "utf8") > MAX_FILE_BYTES) {
      throw new AiEditError(
        "OUTPUT_TOO_LARGE",
        "AI output exceeds 1 MB limit",
        413
      );
    }

    return {
      path,
      originalContent: file.content,
      modifiedContent,
      tokensInput: result.inputTokens,
      tokensOutput: result.outputTokens,
    };
  }

  async applyEdit(
    projectId: string,
    userId: string,
    path: string,
    content: string
  ) {
    const saved = await vfsService.writeFile(projectId, userId, path, content);
    await analyticsService.track(
      WorkspaceMetricEvents.AI_EDITS_APPLIED,
      userId,
      projectId,
      { path }
    );
    return saved;
  }
}

function stripMarkdownFences(text: string): string {
  const fence = /^```[\w]*\n?([\s\S]*?)```$/m.exec(text.trim());
  return fence ? fence[1].trimEnd() : text;
}

export const aiEditService = new AiEditService();
