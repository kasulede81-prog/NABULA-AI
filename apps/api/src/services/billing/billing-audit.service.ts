import type { BillingAuditAction, Prisma } from "@nebula/database";
import { prisma } from "../../lib/prisma";

export class BillingAuditService {
  async log(params: {
    userId: string;
    action: BillingAuditAction;
    message?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await prisma.billingAuditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        message: params.message,
        metadata: params.metadata,
      },
    });
  }
}

export const billingAuditService = new BillingAuditService();
