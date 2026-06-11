import { prisma } from "../lib/prisma";
import { SseEvents, sanitizePersistedText } from "@nebula/shared";
import { resolveLLMProvider } from "../providers/llm";
import { eventService } from "./event.service";
import { vfsService } from "./vfs.service";
import { agentRunService } from "./agent-run.service";
import { projectService } from "./project.service";
import { env } from "../config/env";

const REVIEW_SYSTEM = `You are a code reviewer for generated applications.
Review the project snapshot for obvious issues: missing env examples, broken imports, security risks, incomplete configs.
Be concise. List up to 5 findings or say "No critical issues found."
Do not suggest running commands — only static review.`;

export class ReviewerService {
  isEnabled() {
    return env.REVIEWER_AGENT_ENABLED;
  }

  scheduleReview(projectId: string, userId: string) {
    if (!this.isEnabled()) return;
    setImmediate(() => {
      void this.runReview(projectId, userId).catch((err) => {
        console.warn(`[reviewer] Failed for ${projectId}:`, err);
      });
    });
  }

  async runReview(projectId: string, userId: string) {
    await projectService.get(projectId, userId);
    const files = await vfsService.listTree(projectId, userId);
    if (files.length === 0) return;

    const sample = await Promise.all(
      files.slice(0, 8).map(async (f) => {
        try {
          const file = await vfsService.readFile(projectId, userId, f.path);
          return `--- ${f.path} ---\n${file.content.slice(0, 2000)}`;
        } catch {
          return `--- ${f.path} --- (unreadable)`;
        }
      })
    );

    const run = await agentRunService.start(
      projectId,
      userId,
      "builder",
      "Post-build code review"
    );

    eventService.publish(projectId, SseEvents.AGENT_STARTED, {
      agentType: "reviewer",
      runId: run.id,
    });

    try {
      const llm = resolveLLMProvider();
      const result = await llm.generate({
        system: REVIEW_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Project has ${files.length} files.\n\n${sample.join("\n\n")}`,
          },
        ],
        maxTokens: 1500,
        temperature: 0.2,
      });

      const content = sanitizePersistedText(result.content.trim());
      await agentRunService.complete(
        run.id,
        content.slice(0, 500),
        result.inputTokens,
        result.outputTokens,
        { filesGenerated: Math.min(files.length, 8) }
      );

      const message = await prisma.message.create({
        data: {
          projectId,
          role: "assistant",
          content: `**Code review**\n\n${content}`,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
      eventService.publish(projectId, SseEvents.AGENT_COMPLETED, {
        agentType: "reviewer",
        runId: run.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Review failed";
      await agentRunService.fail(run.id, msg, 0, 0, {}, {
        errorCode: "REVIEW_FAILED",
      });
      eventService.publish(projectId, SseEvents.AGENT_FAILED, {
        agentType: "reviewer",
        runId: run.id,
        error: msg,
      });
    }
  }
}

export const reviewerService = new ReviewerService();
