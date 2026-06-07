import { prisma } from "../lib/prisma";
import type { AgentType } from "@nebula/database";
import { estimateLlmCostUsd, sanitizePersistedText } from "@nebula/shared";
import type { LLMProviderId } from "@nebula/shared";

export interface AgentRunMetrics {
  toolCalls?: number;
  filesGenerated?: number;
  buildDurationMs?: number;
}

export interface AgentRunFailure {
  errorCode?: string;
  failurePhase?: string;
  retryCount?: number;
}

export class AgentRunService {
  async start(
    projectId: string,
    userId: string,
    agentType: AgentType,
    inputPrompt: string,
    llmProvider?: string
  ) {
    return prisma.agentRun.create({
      data: {
        projectId,
        userId,
        agentType,
        status: "running",
        inputPrompt,
        llmProvider: llmProvider ?? null,
      },
    });
  }

  async complete(
    runId: string,
    summary: string,
    tokensInput: number,
    tokensOutput: number,
    metrics: AgentRunMetrics = {}
  ) {
    const existing = await prisma.agentRun.findUnique({ where: { id: runId } });
    const provider = (existing?.llmProvider ?? "anthropic") as LLMProviderId;
    const estimatedCostUsd = estimateLlmCostUsd(provider, tokensInput, tokensOutput);

    return prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        outputSummary: summary,
        tokensInput,
        tokensOutput,
        toolCalls: metrics.toolCalls,
        filesGenerated: metrics.filesGenerated,
        buildDurationMs: metrics.buildDurationMs,
        estimatedCostUsd,
        completedAt: new Date(),
      },
    });
  }

  async fail(
    runId: string,
    errorMessage: string,
    tokensInput = 0,
    tokensOutput = 0,
    metrics: AgentRunMetrics = {},
    failure: AgentRunFailure = {}
  ) {
    const existing = await prisma.agentRun.findUnique({ where: { id: runId } });
    const provider = (existing?.llmProvider ?? "anthropic") as LLMProviderId;
    const estimatedCostUsd = estimateLlmCostUsd(provider, tokensInput, tokensOutput);

    return prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: sanitizePersistedText(errorMessage),
        errorCode: failure.errorCode,
        failurePhase: failure.failurePhase,
        retryCount: failure.retryCount,
        tokensInput,
        tokensOutput,
        toolCalls: metrics.toolCalls,
        filesGenerated: metrics.filesGenerated,
        buildDurationMs: metrics.buildDurationMs,
        estimatedCostUsd,
        completedAt: new Date(),
      },
    });
  }
}

export const agentRunService = new AgentRunService();
