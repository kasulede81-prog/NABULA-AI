import { adminPhase2Service } from "../admin-phase2.service";
import { githubService } from "../github.service";
import { stabilityAuditService } from "./stability-audit.service";
import { prisma } from "../../lib/prisma";

export class RecoveryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class RecoveryService {
  async retryBuild(projectId: string, adminUserId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new RecoveryError("NOT_FOUND", "Project not found", 404);
    }

    await adminPhase2Service.forceRebuild(projectId);

    await stabilityAuditService.log({
      userId: project.userId,
      action: "build_retried",
      message: "Admin retry build",
      metadata: { projectId, adminUserId },
    });

    return { ok: true, projectId };
  }

  async retryPreview(projectId: string, adminUserId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new RecoveryError("NOT_FOUND", "Project not found", 404);
    }

    await adminPhase2Service.restartPreview(projectId);

    await stabilityAuditService.log({
      userId: project.userId,
      action: "preview_retried",
      message: "Admin retry preview",
      metadata: { projectId, adminUserId },
    });

    return { ok: true, projectId };
  }

  async retryGithubSync(projectId: string, adminUserId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new RecoveryError("NOT_FOUND", "Project not found", 404);
    }

    const result = await githubService.syncRepository(projectId, project.userId);

    await stabilityAuditService.log({
      userId: project.userId,
      action: "github_sync_retried",
      message: "Admin retry GitHub sync",
      metadata: { projectId, adminUserId, commitSha: result.commitSha },
    });

    return { ok: true, ...result };
  }
}

export const recoveryService = new RecoveryService();
