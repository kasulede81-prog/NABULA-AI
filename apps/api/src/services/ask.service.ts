import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { SseEvents, sanitizePersistedText } from "@nebula/shared";
import type {
  LLMContentBlock,
  LLMProviderId,
  MessageImageInput,
} from "@nebula/shared";
import { getActiveLLMProviderId } from "../config/llm-provider";
import { resolveLLMProvider } from "../providers/llm";
import { eventService } from "./event.service";
import { getProjectRulesBlock } from "./message-context.service";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";

const ASK_SYSTEM = `You are a helpful coding assistant inside the Nebula AI workspace.
Answer questions about the project, explain code, suggest approaches, and help debug.
You cannot modify files or run builds — only provide guidance.
Be concise and practical. Use markdown when it helps readability.`;

const HISTORY_LIMIT = 20;

export class AskService {
  async respond(
    projectId: string,
    userId: string,
    options: {
      agentContent: string;
      llmProvider?: LLMProviderId;
      images?: MessageImageInput[];
    }
  ) {
    const project = await projectService.get(projectId, userId);
    const streamId = randomUUID();
    const providerId = options.llmProvider ?? getActiveLLMProviderId();

    const history = await prisma.message.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    const rulesBlock = await getProjectRulesBlock(projectId);
    let projectContext = `Project: ${project.name}\nStatus: ${project.status}`;
    if (project.specJson) {
      const spec = project.specJson as { name?: string; appType?: string };
      projectContext += `\nApp: ${spec.name ?? project.name} (${spec.appType ?? "web"})`;
    }

    try {
      const files = await vfsService.listTree(projectId, userId);
      if (files.length > 0) {
        projectContext += `\nFiles (${files.length}): ${files
          .slice(0, 30)
          .map((f) => f.path)
          .join(", ")}${files.length > 30 ? "…" : ""}`;
      }
    } catch {
      /* ignore */
    }

    const llm = resolveLLMProvider(providerId);
    const userContent: string | LLMContentBlock[] =
      options.images && options.images.length > 0
        ? [
            ...options.images.map((img) => ({
              type: "image" as const,
              mediaType: img.mediaType,
              data: img.data,
            })),
            { type: "text" as const, text: options.agentContent },
          ]
        : options.agentContent;
    const messages = [
      ...history
        .reverse()
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user" as const, content: userContent },
    ];

    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (llm.stream) {
      for await (const chunk of llm.stream({
        system: ASK_SYSTEM + rulesBlock + `\n\n${projectContext}`,
        messages,
        maxTokens: 4096,
        temperature: 0.4,
      })) {
        if (chunk.type === "text" && chunk.text) {
          fullContent += chunk.text;
          eventService.publish(projectId, SseEvents.MESSAGE_DELTA, {
            streamId,
            delta: chunk.text,
          });
        }
        if (chunk.type === "done") {
          inputTokens = chunk.inputTokens ?? inputTokens;
          outputTokens = chunk.outputTokens ?? outputTokens;
        }
      }
    } else {
      const result = await llm.generate({
        system: ASK_SYSTEM + rulesBlock + `\n\n${projectContext}`,
        messages,
        maxTokens: 4096,
        temperature: 0.4,
      });
      fullContent = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      eventService.publish(projectId, SseEvents.MESSAGE_DELTA, {
        streamId,
        delta: fullContent,
      });
    }

    const content = sanitizePersistedText(fullContent.trim() || "I could not generate a response.");
    const message = await prisma.message.create({
      data: { projectId, role: "assistant", content },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_DELTA, {
      streamId,
      delta: "",
      done: true,
      messageId: message.id,
    });
    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, {
      ...message,
      streamId,
    });

    return { message, streamId, inputTokens, outputTokens };
  }

  schedule(
    projectId: string,
    userId: string,
    options: {
      agentContent: string;
      llmProvider?: LLMProviderId;
      images?: MessageImageInput[];
    }
  ) {
    setImmediate(() => {
      this.respond(projectId, userId, options).catch((err) => {
        console.error(`[ask] Failed for ${projectId}:`, err);
        const msg =
          err instanceof Error ? err.message : "Ask mode failed";
        void prisma.message
          .create({
            data: {
              projectId,
              role: "assistant",
              content: sanitizePersistedText(`Sorry, I could not answer: ${msg}`),
            },
            select: { id: true, role: true, content: true, createdAt: true },
          })
          .then((message) => {
            eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
          });
      });
    });
  }
}

export const askService = new AskService();
