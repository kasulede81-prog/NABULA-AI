import type { Prisma, WorkspaceAuditAction } from "@nebula/database";
import { prisma } from "../../lib/prisma";

export class WorkspaceAuditService {
  async log(input: {
    workspaceId: string;
    userId?: string;
    action: WorkspaceAuditAction;
    message?: string;
    metadata?: Record<string, unknown>;
  }) {
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: input.action,
        message: input.message,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

export const workspaceAuditService = new WorkspaceAuditService();
