import crypto from "crypto";
import type { ErrorSource, Prisma } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { stabilityAuditService } from "./stability-audit.service";

export interface CaptureErrorInput {
  source: ErrorSource;
  code: string;
  message: string;
  userId?: string;
  projectId?: string;
  metadata?: Prisma.InputJsonValue;
}

function fingerprint(source: ErrorSource, code: string, message: string): string {
  const raw = `${source}:${code}:${message.slice(0, 200)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export class ErrorMonitorService {
  async capture(input: CaptureErrorInput) {
    const fp = fingerprint(input.source, input.code, input.message);

    const errorLog = await prisma.errorLog.upsert({
      where: { fingerprint: fp },
      create: {
        fingerprint: fp,
        source: input.source,
        code: input.code,
        message: input.message.slice(0, 500),
        count: 1,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        message: input.message.slice(0, 500),
      },
    });

    const event = await prisma.errorEvent.create({
      data: {
        errorLogId: errorLog.id,
        source: input.source,
        code: input.code,
        message: input.message.slice(0, 2000),
        userId: input.userId,
        projectId: input.projectId,
        metadata: input.metadata,
      },
    });

    void stabilityAuditService.log({
      userId: input.userId,
      action: "error_logged",
      metadata: {
        source: input.source,
        code: input.code,
        eventId: event.id,
        projectId: input.projectId,
      },
    });

    return { eventId: event.id, errorLogId: errorLog.id };
  }

  captureFromUnknown(
    source: ErrorSource,
    err: unknown,
    context?: { userId?: string; projectId?: string; code?: string }
  ) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    const code =
      context?.code ??
      (err instanceof Error && "code" in err
        ? String((err as { code: unknown }).code)
        : "UNKNOWN");

    return this.capture({
      source,
      code,
      message,
      userId: context?.userId,
      projectId: context?.projectId,
      metadata: err instanceof Error ? { name: err.name } : undefined,
    });
  }

  async listEvents(opts: {
    search?: string;
    source?: ErrorSource;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.ErrorEventWhereInput = {};
    if (opts.source) where.source = opts.source;
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { message: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.errorEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.errorEvent.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        source: e.source,
        code: e.code,
        message: e.message,
        userId: e.userId,
        userEmail: e.user?.email ?? null,
        projectId: e.projectId,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats() {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [totalEvents, last24h, bySource, topErrors] = await Promise.all([
      prisma.errorEvent.count(),
      prisma.errorEvent.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.errorEvent.groupBy({
        by: ["source"],
        _count: { id: true },
        where: { createdAt: { gte: since } },
      }),
      prisma.errorLog.findMany({
        orderBy: { count: "desc" },
        take: 10,
        select: {
          id: true,
          source: true,
          code: true,
          message: true,
          count: true,
          lastSeenAt: true,
        },
      }),
    ]);

    return {
      totalEvents,
      last24h,
      bySource: bySource.map((r) => ({
        source: r.source,
        count: r._count.id,
      })),
      topErrors: topErrors.map((e) => ({
        ...e,
        lastSeenAt: e.lastSeenAt.toISOString(),
      })),
    };
  }
}

export const errorMonitorService = new ErrorMonitorService();
