import type { Prisma, SupportAuditAction } from "@nebula/database";
import { prisma } from "../../lib/prisma";

export class SupportAuditService {
  async log(params: {
    userId: string;
    action: SupportAuditAction;
    message?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await prisma.supportAuditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        message: params.message,
        metadata: params.metadata,
      },
    });
  }
}

export const supportAuditService = new SupportAuditService();
