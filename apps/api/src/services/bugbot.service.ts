import { prisma } from "../lib/prisma";
import { SseEvents, sanitizePersistedText } from "@nebula/shared";
import { resolveLLMProvider } from "../providers/llm";
import { eventService } from "./event.service";
import { agentRunService } from "./agent-run.service";
import { env } from "../config/env";

const BUGBOT_SYSTEM = `You are Bugbot, an automated code reviewer (like Cursor's Bugbot).
You review PROPOSED diffs before they are applied to a project.
Look for: real bugs, broken imports/references, security issues, data loss risks, obvious logic errors.
Ignore style and formatting. Only report issues you are confident about.
Format each finding as: "[severity] path — issue" where severity is HIGH, MEDIUM, or LOW.
If everything looks fine, reply exactly: "No issues found."
Max 5 findings, one line each.`;

interface DiffEntry {
  path: string;
  previousContent: string;
  newContent: string;
}

export class BugbotService {
  private timers = new Map<string, NodeJS.Timeout>();

  isEnabled() {
    return env.BUGBOT_ENABLED;
  }

  /** Standalone review (used for GitHub PR comments). Returns markdown or null. */
  async generateReview(files: DiffEntry[]): Promise<string | null> {
    if (!this.isEnabled() || files.length === 0) return null;
    const diffs = files.slice(0, 10).map((f) => {
      const before = f.previousContent.slice(0, 3000);
      const after = f.newContent.slice(0, 4000);
      return `=== ${f.path} ===\n--- BEFORE ---\n${before || "(new file)"}\n--- AFTER ---\n${after}`;
    });
    try {
      const llm = resolveLLMProvider();
      const result = await llm.generate({
        system: BUGBOT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Proposed changeset (${files.length} files):\n\n${diffs.join("\n\n")}`,
          },
        ],
        maxTokens: 1000,
        temperature: 0,
      });
      return sanitizePersistedText(result.content.trim()) || null;
    } catch {
      return null;
    }
  }

  /** Debounced: agent builds stage many files in quick succession. */
  scheduleReview(projectId: string, userId: string, files: DiffEntry[]) {
    if (!this.isEnabled() || files.length === 0) return;
    const existing = this.timers.get(projectId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      projectId,
      setTimeout(() => {
        this.timers.delete(projectId);
        void this.runReview(projectId, userId, files).catch((err) => {
          console.warn(`[bugbot] Failed for ${projectId}:`, err);
        });
      }, 4000)
    );
  }

  async runReview(projectId: string, userId: string, files: DiffEntry[]) {
    const diffs = files.slice(0, 10).map((f) => {
      const before = f.previousContent.slice(0, 3000);
      const after = f.newContent.slice(0, 4000);
      return `=== ${f.path} ===\n--- BEFORE ---\n${before || "(new file)"}\n--- AFTER ---\n${after}`;
    });

    const run = await agentRunService.start(
      projectId,
      userId,
      "builder",
      "Bugbot changeset review"
    );

    eventService.publish(projectId, SseEvents.AGENT_STARTED, {
      agentType: "bugbot",
      runId: run.id,
    });

    try {
      const llm = resolveLLMProvider();
      const result = await llm.generate({
        system: BUGBOT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Proposed changeset (${files.length} files):\n\n${diffs.join("\n\n")}`,
          },
        ],
        maxTokens: 1000,
        temperature: 0,
      });

      const content = sanitizePersistedText(result.content.trim());
      await agentRunService.complete(
        run.id,
        content.slice(0, 500),
        result.inputTokens,
        result.outputTokens,
        { filesGenerated: files.length }
      );

      const clean = /no issues found/i.test(content);
      const message = await prisma.message.create({
        data: {
          projectId,
          role: "assistant",
          content: clean
            ? "**Bugbot** — No issues found in the proposed changes."
            : `**Bugbot review** (proposed changes)\n\n${content}`,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
      eventService.publish(projectId, SseEvents.AGENT_COMPLETED, {
        agentType: "bugbot",
        runId: run.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bugbot review failed";
      await agentRunService.fail(run.id, msg, 0, 0, {}, {
        errorCode: "BUGBOT_FAILED",
      });
      eventService.publish(projectId, SseEvents.AGENT_FAILED, {
        agentType: "bugbot",
        runId: run.id,
        error: msg,
      });
    }
  }
}

export const bugbotService = new BugbotService();
