import type { FeedbackCategory, FeedbackStatus } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { stabilityAuditService } from "./stability-audit.service";

export class FeedbackError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class FeedbackService {
  async submit(userId: string, category: FeedbackCategory, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new FeedbackError("EMPTY_MESSAGE", "Feedback message is required", 400);
    }

    const record = await prisma.feedback.create({
      data: { userId, category, message: trimmed },
    });

    await stabilityAuditService.log({
      userId,
      action: "feedback_submitted",
      metadata: { feedbackId: record.id, category },
    });

    return {
      id: record.id,
      category: record.category,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async listForAdmin(opts: {
    status?: FeedbackStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = opts.status ? { status: opts.status } : {};

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.feedback.count({ where }),
    ]);

    return {
      items: items.map((f) => ({
        id: f.id,
        userId: f.userId,
        userEmail: f.user.email,
        userName: f.user.name,
        category: f.category,
        message: f.message,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateStatus(feedbackId: string, status: FeedbackStatus) {
    const updated = await prisma.feedback.update({
      where: { id: feedbackId },
      data: { status },
    });
    return { id: updated.id, status: updated.status };
  }

  async getOpenCount(): Promise<number> {
    return prisma.feedback.count({ where: { status: "open" } });
  }
}

export const feedbackService = new FeedbackService();
