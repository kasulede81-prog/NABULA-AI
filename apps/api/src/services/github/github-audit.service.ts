import type { GithubAuditAction, Prisma } from "@nebula/database";
import { prisma } from "../../lib/prisma";

export class GithubAuditService {
  async log(params: {
    userId: string;
    action: GithubAuditAction;
    projectId?: string;
    message?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await prisma.githubAuditLog.create({
      data: {
        userId: params.userId,
        projectId: params.projectId,
        action: params.action,
        message: params.message,
        metadata: params.metadata,
      },
    });
  }
}

export const githubAuditService = new GithubAuditService();
