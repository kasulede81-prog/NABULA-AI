import { prisma } from "../../lib/prisma";
import { supportAuditService } from "./support-audit.service";

export class SupportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class SupportChatService {
  async getOrCreateConversation(userId: string) {
    const existing = await prisma.supportConversation.findFirst({
      where: { userId, status: "open" },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        user: { select: { email: true, name: true } },
      },
    });

    if (existing) return this.formatConversation(existing);

    const created = await prisma.supportConversation.create({
      data: { userId, status: "open" },
      include: {
        messages: true,
        user: { select: { email: true, name: true } },
      },
    });

    return this.formatConversation(created);
  }

  async sendUserMessage(userId: string, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new SupportError("EMPTY_MESSAGE", "Message cannot be empty", 400);
    }

    const conversation = await this.getOrCreateConversation(userId);
    const record = await prisma.supportMessage.create({
      data: {
        conversationId: conversation.id,
        senderType: "user",
        senderUserId: userId,
        message: trimmed,
        readByUser: true,
        readByAdmin: false,
      },
    });

    await prisma.supportConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    await supportAuditService.log({
      userId,
      action: "support_message_sent",
      metadata: {
        conversationId: conversation.id,
        messageId: record.id,
        senderType: "user",
      },
    });

    return {
      id: record.id,
      senderType: record.senderType,
      message: record.message,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async sendAdminMessage(
    conversationId: string,
    adminUserId: string,
    message: string
  ) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new SupportError("EMPTY_MESSAGE", "Message cannot be empty", 400);
    }

    const conversation = await prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new SupportError("NOT_FOUND", "Conversation not found", 404);
    }

    const record = await prisma.supportMessage.create({
      data: {
        conversationId,
        senderType: "admin",
        senderUserId: adminUserId,
        message: trimmed,
        readByUser: false,
        readByAdmin: true,
      },
    });

    await prisma.supportConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await supportAuditService.log({
      userId: conversation.userId,
      action: "support_message_sent",
      metadata: {
        conversationId,
        messageId: record.id,
        senderType: "admin",
        adminUserId,
      },
    });

    return {
      id: record.id,
      senderType: record.senderType,
      message: record.message,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async listConversationsForAdmin() {
    const rows = await prisma.supportConversation.findMany({
      where: { status: "open" },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            messages: {
              where: { senderType: "user", readByAdmin: false },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userEmail: row.user.email,
      userName: row.user.name,
      status: row.status,
      unreadCount: row._count.messages,
      lastMessage: row.messages[0]
        ? {
            message: row.messages[0].message,
            senderType: row.messages[0].senderType,
            createdAt: row.messages[0].createdAt.toISOString(),
          }
        : null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getConversationForAdmin(conversationId: string) {
    const row = await prisma.supportConversation.findUnique({
      where: { id: conversationId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!row) {
      throw new SupportError("NOT_FOUND", "Conversation not found", 404);
    }

    await prisma.supportMessage.updateMany({
      where: {
        conversationId,
        senderType: "user",
        readByAdmin: false,
      },
      data: { readByAdmin: true },
    });

    return this.formatConversation(row);
  }

  async markReadByUser(userId: string) {
    const conversation = await prisma.supportConversation.findFirst({
      where: { userId, status: "open" },
      orderBy: { updatedAt: "desc" },
    });
    if (!conversation) return { marked: 0 };

    const result = await prisma.supportMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderType: "admin",
        readByUser: false,
      },
      data: { readByUser: true },
    });

    return { marked: result.count };
  }

  async getUserUnreadCount(userId: string): Promise<number> {
    const conversation = await prisma.supportConversation.findFirst({
      where: { userId, status: "open" },
      orderBy: { updatedAt: "desc" },
    });
    if (!conversation) return 0;

    return prisma.supportMessage.count({
      where: {
        conversationId: conversation.id,
        senderType: "admin",
        readByUser: false,
      },
    });
  }

  async getAdminUnreadCount(): Promise<number> {
    return prisma.supportMessage.count({
      where: { senderType: "user", readByAdmin: false },
    });
  }

  private formatConversation(
    row: {
      id: string;
      userId: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      user?: { email: string; name: string };
      messages: Array<{
        id: string;
        senderType: string;
        message: string;
        createdAt: Date;
        readByUser: boolean;
        readByAdmin: boolean;
      }>;
    }
  ) {
    return {
      id: row.id,
      userId: row.userId,
      userEmail: row.user?.email,
      userName: row.user?.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}

export const supportChatService = new SupportChatService();
