import {
  AgentError,
  clarifierOutputSchema,
  SseEvents,
  type ClarifierOutput,
} from "@nebula/shared";
import { prisma } from "../lib/prisma";
import { getLLMProvider } from "../providers/llm";
import { agentRunService } from "./agent-run.service";
import { eventService } from "./event.service";
import { projectService } from "./project.service";

const CLARIFIER_SYSTEM = `You are the Clarifier agent for Nebula AI, an app builder platform.
Your job is to analyze a user's app request and either ask clarifying questions OR produce a complete specification.

RULES:
- Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "ready": boolean,
  "questions": [{ "id": "1", "text": "question" }],
  "spec": null | { "appType": string, "name": string, "description": string, "features": string[], "stack": "nextjs-prisma-tailwind", "entities": [{ "name": string, "fields": string[] }], "pages": string[] }
}
- Ask 1 to 3 questions ONLY when the request is genuinely ambiguous.
- If the request is clear enough (e.g. "Build a simple CRM", "restaurant POS"), set ready=true and produce spec immediately.
- stack is ALWAYS "nextjs-prisma-tailwind" — never ask about stack.
- After user answers questions, you MUST set ready=true and produce spec (make reasonable assumptions for anything still unclear).
- spec.features must list concrete features (3-8 items).
- spec.entities should list data models with fields when applicable.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

function formatQuestionsMessage(questions: ClarifierOutput["questions"]): string {
  const lines = questions.map((q, i) => `${i + 1}. ${q.text}`);
  return `I have a few questions before I start building:\n\n${lines.join("\n")}\n\nPlease answer in your next message.`;
}

function formatSpecReadyMessage(spec: NonNullable<ClarifierOutput["spec"]>): string {
  return (
    `Specification ready for **${spec.name}** (${spec.appType}).\n\n` +
    `**Features:** ${spec.features.join(", ")}\n\n` +
    `Starting build now...`
  );
}

export class ClarifierService {
  async run(projectId: string, userId: string, forceReady = false) {
    const project = await projectService.get(projectId, userId);

    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const hasAskedQuestions = messages.some(
      (m) => m.role === "assistant" && m.content.includes("questions before I start")
    );

    const forceSpec = forceReady || hasAskedQuestions;

    const run = await agentRunService.start(
      projectId,
      userId,
      "clarifier",
      project.prompt
    );

    eventService.publish(projectId, SseEvents.AGENT_STARTED, {
      agentType: "clarifier",
      runId: run.id,
    });

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: "clarifying",
      message: "Analyzing your request...",
    });

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const llm = getLLMProvider();
      const userPrompt = forceSpec
        ? `${conversation}\n\nThe user has answered your questions. Produce the final spec now with ready=true. Make reasonable assumptions for anything unclear.`
        : `Original request: ${project.prompt}\n\nConversation:\n${conversation}`;

      const result = await llm.generate({
        system: CLARIFIER_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 4096,
      });

      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;

      const parsed = clarifierOutputSchema.parse(extractJson(result.content));

      if (!parsed.ready && parsed.questions.length > 0 && !forceSpec) {
        const assistantContent = formatQuestionsMessage(parsed.questions);

        await prisma.project.update({
          where: { id: projectId },
          data: { status: "clarifying" },
        });

        const message = await this.createAssistantMessage(projectId, assistantContent);

        eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
          id: projectId,
          status: "clarifying",
        });

        eventService.publish(projectId, SseEvents.AGENT_COMPLETED, {
          agentType: "clarifier",
          runId: run.id,
          ready: false,
          questionCount: parsed.questions.length,
        });

        await agentRunService.complete(
          run.id,
          `Asked ${parsed.questions.length} questions`,
          inputTokens,
          outputTokens
        );

        return { ready: false, questions: parsed.questions, message };
      }

      if (!parsed.spec) {
        throw new Error("Clarifier returned ready without spec");
      }

      await prisma.project.update({
        where: { id: projectId },
        data: {
          specJson: parsed.spec,
          status: "draft",
        },
      });

      const assistantContent = formatSpecReadyMessage(parsed.spec);
      const message = await this.createAssistantMessage(projectId, assistantContent);

      eventService.publish(projectId, SseEvents.AGENT_COMPLETED, {
        agentType: "clarifier",
        runId: run.id,
        ready: true,
        appType: parsed.spec.appType,
      });

      eventService.publish(projectId, SseEvents.PROGRESS, {
        step: "spec_ready",
        message: `Specification ready: ${parsed.spec.name}`,
      });

      await agentRunService.complete(
        run.id,
        `Spec: ${parsed.spec.appType}`,
        inputTokens,
        outputTokens
      );

      return { ready: true, spec: parsed.spec, message };
    } catch (err) {
      const agentErr =
        err instanceof AgentError
          ? err
          : new AgentError("CLARIFIER_ERROR", err instanceof Error ? err.message : "Clarifier failed", 500, false);
      const msg = agentErr.message;
      await agentRunService.fail(run.id, msg, inputTokens, outputTokens);

      eventService.publish(projectId, SseEvents.AGENT_FAILED, {
        agentType: "clarifier",
        runId: run.id,
        error: msg,
      });

      const errorMessage = await this.createAssistantMessage(
        projectId,
        `Clarification failed: ${msg}\n\nPlease check your API configuration and try again.`
      );

      return { ready: false, error: msg, message: errorMessage };
    }
  }

  private async createAssistantMessage(projectId: string, content: string) {
    const message = await prisma.message.create({
      data: { projectId, role: "assistant", content },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
    return message;
  }
}

export const clarifierService = new ClarifierService();
