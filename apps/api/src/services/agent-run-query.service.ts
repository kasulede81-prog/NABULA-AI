import { prisma } from "../lib/prisma";
import { projectService, ProjectError } from "./project.service";
import { buildService } from "./build.service";

export class AgentRunQueryService {
  async list(projectId: string, userId: string, limit = 30) {
    await projectService.get(projectId, userId);
    return prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        agentType: true,
        status: true,
        inputPrompt: true,
        outputSummary: true,
        errorMessage: true,
        errorCode: true,
        llmProvider: true,
        tokensInput: true,
        tokensOutput: true,
        toolCalls: true,
        filesGenerated: true,
        buildDurationMs: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }

  async cancel(projectId: string, userId: string, runId: string) {
    await projectService.get(projectId, userId);
    const run = await prisma.agentRun.findFirst({
      where: { id: runId, projectId },
    });
    if (!run) {
      throw new ProjectError("NOT_FOUND", "Agent run not found", 404);
    }
    if (run.status !== "running") {
      throw new ProjectError(
        "INVALID_STATE",
        "Only running agent tasks can be cancelled",
        400
      );
    }

    buildService.requestCancel(projectId);

    return prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorCode: "CANCELLED",
        errorMessage: "Cancelled by user",
        completedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        completedAt: true,
      },
    });
  }

  isActive(projectId: string) {
    return buildService.isPipelineActive(projectId);
  }
}

export const agentRunQueryService = new AgentRunQueryService();
