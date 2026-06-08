import type { AdminAuditAction, Prisma } from "@nebula/database";
import { prisma } from "../lib/prisma";

export interface AuditLogInput {
  adminUserId: string;
  action: AdminAuditAction;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

export class AdminAuditService {
  async log(input: AuditLogInput): Promise<void> {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: input.adminUserId,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          targetLabel: input.targetLabel ?? null,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      console.warn("[admin-audit] Failed to persist audit log:", err);
    }
  }

  async list(opts: {
    page?: number;
    limit?: number;
    action?: AdminAuditAction;
    search?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.AdminAuditLogWhereInput = {};
    if (opts.action) where.action = opts.action;
    if (opts.search?.trim()) {
      where.OR = [
        { targetLabel: { contains: opts.search.trim(), mode: "insensitive" } },
        { targetId: { contains: opts.search.trim(), mode: "insensitive" } },
        { admin: { email: { contains: opts.search.trim(), mode: "insensitive" } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          admin: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        adminId: r.adminUserId,
        adminEmail: r.admin.email,
        adminName: r.admin.name,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const adminAuditService = new AdminAuditService();
