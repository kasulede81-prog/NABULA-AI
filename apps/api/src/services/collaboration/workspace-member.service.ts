import crypto from "node:crypto";
import type { WorkspaceMemberRole } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import {
  workspaceAccessService,
  WorkspaceAccessError,
} from "./workspace-access.service";
import { workspaceAuditService } from "./workspace-audit.service";
import { WorkspaceError } from "./workspace.service";

const INVITE_TTL_DAYS = 7;

export class WorkspaceMemberService {
  async invite(
    workspaceId: string,
    inviterId: string,
    email: string,
    role: WorkspaceMemberRole = "member"
  ) {
    await workspaceAccessService.requireMembership(workspaceId, inviterId, "admin");

    if (role === "owner") {
      throw new WorkspaceError(
        "INVALID_ROLE",
        "Cannot invite as owner; use transfer ownership",
        400
      );
    }

    const normalized = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existingUser) {
      const member = await workspaceAccessService.getMembership(
        workspaceId,
        existingUser.id
      );
      if (member) {
        throw new WorkspaceError(
          "ALREADY_MEMBER",
          "User is already a workspace member",
          409
        );
      }
    }

    const pending = await prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        email: normalized,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new WorkspaceError(
        "INVITE_PENDING",
        "An invitation is already pending for this email",
        409
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email: normalized,
        role,
        token,
        invitedBy: inviterId,
        expiresAt,
      },
    });

    await workspaceAuditService.log({
      workspaceId,
      userId: inviterId,
      action: "member_invited",
      message: `Invited ${normalized}`,
      metadata: { email: normalized, role, invitationId: invitation.id },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(workspaceId: string, userId: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new WorkspaceError("NOT_FOUND", "User not found", 404);
    }

    const invitation = await prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        token,
        status: "pending",
      },
    });

    if (!invitation) {
      throw new WorkspaceError("NOT_FOUND", "Invitation not found", 404);
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      throw new WorkspaceError("INVITE_EXPIRED", "Invitation has expired", 410);
    }

    if (invitation.email !== user.email.toLowerCase()) {
      throw new WorkspaceAccessError(
        "FORBIDDEN",
        "Invitation email does not match your account",
        403
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
        },
      });
      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted" },
      });
    });

    await workspaceAuditService.log({
      workspaceId,
      userId,
      action: "member_joined",
      message: `${user.email} joined the workspace`,
      metadata: { role: invitation.role },
    });

    return { ok: true, workspaceId, role: invitation.role };
  }

  async updateRole(
    workspaceId: string,
    actorId: string,
    memberId: string,
    role: WorkspaceMemberRole
  ) {
    await workspaceAccessService.requireMembership(workspaceId, actorId, "admin");

    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });
    if (!member) {
      throw new WorkspaceError("NOT_FOUND", "Member not found", 404);
    }

    if (member.role === "owner") {
      throw new WorkspaceError("FORBIDDEN", "Cannot change owner role directly", 403);
    }
    if (role === "owner") {
      throw new WorkspaceError(
        "INVALID_ROLE",
        "Use transfer ownership to assign owner",
        400
      );
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });

    await workspaceAuditService.log({
      workspaceId,
      userId: actorId,
      action: "role_changed",
      message: `Role changed for member ${member.userId}`,
      metadata: { memberId, userId: member.userId, role },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
    };
  }

  async remove(workspaceId: string, actorId: string, memberId: string) {
    await workspaceAccessService.requireMembership(workspaceId, actorId, "admin");

    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });
    if (!member) {
      throw new WorkspaceError("NOT_FOUND", "Member not found", 404);
    }

    if (member.role === "owner") {
      throw new WorkspaceError("FORBIDDEN", "Cannot remove workspace owner", 403);
    }

    if (member.userId === actorId) {
      const actor = await workspaceAccessService.getMembership(workspaceId, actorId);
      if (actor?.role !== "owner") {
        throw new WorkspaceError("FORBIDDEN", "Admins cannot remove themselves", 403);
      }
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });

    await workspaceAuditService.log({
      workspaceId,
      userId: actorId,
      action: "member_removed",
      message: `Member ${member.userId} removed`,
      metadata: { memberId, userId: member.userId },
    });

    return { ok: true };
  }
}

export const workspaceMemberService = new WorkspaceMemberService();
