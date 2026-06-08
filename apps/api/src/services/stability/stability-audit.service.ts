import type { Prisma, StabilityAuditAction } from "@nebula/database";
import { prisma } from "../../lib/prisma";

export class StabilityAuditService {
  async log(params: {
    userId?: string;
    action: StabilityAuditAction;
    message?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await prisma.stabilityAuditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          message: params.message,
          metadata: params.metadata,
        },
      });
    } catch (err) {
      console.warn("[stability] audit log failed:", err);
    }
  }
}

export const stabilityAuditService = new StabilityAuditService();
