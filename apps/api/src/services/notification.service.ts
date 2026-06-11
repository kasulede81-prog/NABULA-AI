import type { Prisma } from "@nebula/database";
import { prisma } from "../lib/prisma";
import { SseEvents } from "@nebula/shared";
import { eventService } from "./event.service";

export type NotificationType =
  | "build.completed"
  | "build.failed"
  | "changeset.proposed"
  | "preview.ready"
  | "deploy.ready"
  | "agent.failed";

export class NotificationService {
  async create(
    projectId: string,
    userId: string,
    input: {
      type: NotificationType;
      title: string;
      body?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const row = await prisma.projectNotification.create({
      data: {
        projectId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? "",
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        read: true,
        metadata: true,
        createdAt: true,
      },
    });

    eventService.publish(projectId, SseEvents.NOTIFICATION_CREATED, row);
    return row;
  }

  async list(projectId: string, userId: string, limit = 30) {
    const rows = await prisma.projectNotification.findMany({
      where: { projectId, userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        read: true,
        metadata: true,
        createdAt: true,
      },
    });
    const unread = await prisma.projectNotification.count({
      where: { projectId, userId, read: false },
    });
    return { data: rows, unread };
  }

  async markRead(projectId: string, userId: string, notificationId: string) {
    await prisma.projectNotification.updateMany({
      where: { id: notificationId, projectId, userId },
      data: { read: true },
    });
    return { ok: true };
  }

  async markAllRead(projectId: string, userId: string) {
    await prisma.projectNotification.updateMany({
      where: { projectId, userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}

export const notificationService = new NotificationService();
