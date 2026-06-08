import type { PlanTier } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { adminDashboardService } from "../admin-dashboard.service";
import { supportAuditService } from "./support-audit.service";
import { supportChatService, SupportError } from "./support-chat.service";

const UPGRADE_INTRO_MESSAGE =
  "Hi! I'd like to upgrade to the Pro plan. Please let me know the next steps.";

export class UpgradeRequestService {
  async getPendingForUser(userId: string) {
    return prisma.upgradeRequest.findFirst({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  async listPending() {
    const rows = await prisma.upgradeRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user.email,
      userName: r.user.name,
      requestedPlan: r.requestedPlan,
      status: r.status,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getPendingCount(): Promise<number> {
    return prisma.upgradeRequest.count({ where: { status: "pending" } });
  }

  /** Create upgrade request, open support chat, send intro message. */
  async requestUpgrade(userId: string, requestedPlan: PlanTier = "pro") {
    const existing = await this.getPendingForUser(userId);
    if (existing) {
      const conversation = await supportChatService.getOrCreateConversation(userId);
      return {
        upgradeRequest: {
          id: existing.id,
          status: existing.status,
          requestedPlan: existing.requestedPlan,
          createdAt: existing.createdAt.toISOString(),
        },
        conversation,
        alreadyPending: true,
      };
    }

    const upgradeRequest = await prisma.upgradeRequest.create({
      data: { userId, requestedPlan, status: "pending" },
    });

    await supportAuditService.log({
      userId,
      action: "upgrade_requested",
      metadata: {
        upgradeRequestId: upgradeRequest.id,
        requestedPlan,
      },
    });

    const conversation = await supportChatService.getOrCreateConversation(userId);
    await supportChatService.sendUserMessage(userId, UPGRADE_INTRO_MESSAGE);

    const refreshed = await supportChatService.getOrCreateConversation(userId);

    return {
      upgradeRequest: {
        id: upgradeRequest.id,
        status: upgradeRequest.status,
        requestedPlan: upgradeRequest.requestedPlan,
        createdAt: upgradeRequest.createdAt.toISOString(),
      },
      conversation: refreshed,
      alreadyPending: false,
    };
  }

  async approve(requestId: string, adminUserId: string, notes?: string) {
    const request = await prisma.upgradeRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { email: true } } },
    });

    if (!request) {
      throw new SupportError("NOT_FOUND", "Upgrade request not found", 404);
    }
    if (request.status !== "pending") {
      throw new SupportError(
        "INVALID_STATUS",
        `Request is already ${request.status}`,
        409
      );
    }

    await adminDashboardService.upgradeUserToPro(request.userId);

    const updated = await prisma.upgradeRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        notes: notes?.trim() || "Approved by admin",
      },
    });

    await supportAuditService.log({
      userId: request.userId,
      action: "upgrade_approved",
      message: notes,
      metadata: {
        upgradeRequestId: requestId,
        adminUserId,
        requestedPlan: request.requestedPlan,
      },
    });

    await supportChatService.sendAdminMessage(
      (
        await supportChatService.getOrCreateConversation(request.userId)
      ).id,
      adminUserId,
      "Your Pro upgrade has been approved! You now have unlimited projects, higher preview limits, and priority queue access."
    );

    return {
      id: updated.id,
      status: updated.status,
      userId: updated.userId,
      userEmail: request.user.email,
    };
  }

  async reject(requestId: string, adminUserId: string, notes?: string) {
    const request = await prisma.upgradeRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { email: true } } },
    });

    if (!request) {
      throw new SupportError("NOT_FOUND", "Upgrade request not found", 404);
    }
    if (request.status !== "pending") {
      throw new SupportError(
        "INVALID_STATUS",
        `Request is already ${request.status}`,
        409
      );
    }

    const updated = await prisma.upgradeRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        notes: notes?.trim() || "Rejected by admin",
      },
    });

    await supportAuditService.log({
      userId: request.userId,
      action: "upgrade_rejected",
      message: notes,
      metadata: {
        upgradeRequestId: requestId,
        adminUserId,
      },
    });

    const reason = notes?.trim() ? ` Reason: ${notes.trim()}` : "";
    await supportChatService.sendAdminMessage(
      (
        await supportChatService.getOrCreateConversation(request.userId)
      ).id,
      adminUserId,
      `Your Pro upgrade request was not approved at this time.${reason} Feel free to reach out if you have questions.`
    );

    return {
      id: updated.id,
      status: updated.status,
      userId: updated.userId,
      userEmail: request.user.email,
    };
  }
}

export const upgradeRequestService = new UpgradeRequestService();
