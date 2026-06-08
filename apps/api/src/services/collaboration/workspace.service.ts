import type { PlanTier, WorkspaceMemberRole } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { uniqueSlug } from "../../lib/slug";
import {
  workspaceAccessService,
  WorkspaceAccessError,
} from "./workspace-access.service";
import { workspaceAuditService } from "./workspace-audit.service";

export class WorkspaceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function serializeWorkspace(w: {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: PlanTier;
  createdAt: Date;
  updatedAt: Date;
  _count?: { members: number; projects: number };
}) {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    ownerId: w.ownerId,
    plan: w.plan,
    membersCount: w._count?.members ?? 0,
    projectsCount: w._count?.projects ?? 0,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export class WorkspaceService {
  async create(ownerId: string, name: string) {
    const slug = await uniqueSlug(name, async (s) => {
      const found = await prisma.workspace.findUnique({ where: { slug: s } });
      return !!found;
    });

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { name, slug, ownerId, plan: "free" },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: ownerId,
          role: "owner",
        },
      });
      return ws;
    });

    await workspaceAuditService.log({
      workspaceId: workspace.id,
      userId: ownerId,
      action: "workspace_created",
      message: `Workspace "${name}" created`,
    });

    return serializeWorkspace(workspace);
  }

  async listForUser(userId: string) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, projects: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      ...serializeWorkspace(m.workspace),
      role: m.role,
    }));
  }

  async get(workspaceId: string, userId: string) {
    await workspaceAccessService.requireMembership(workspaceId, userId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: { select: { members: true, projects: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        invitations: {
          where: { status: "pending", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!workspace) {
      throw new WorkspaceError("NOT_FOUND", "Workspace not found", 404);
    }

    const myRole = workspace.members.find((m) => m.userId === userId)?.role ?? "member";

    return {
      ...serializeWorkspace(workspace),
      role: myRole,
      members: workspace.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        invitedBy: m.invitedBy,
        createdAt: m.createdAt.toISOString(),
      })),
      invitations: workspace.invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
    };
  }

  async rename(workspaceId: string, userId: string, name: string) {
    await workspaceAccessService.requireMembership(workspaceId, userId, "admin");
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { name },
    });
    return serializeWorkspace(workspace);
  }

  async delete(workspaceId: string, userId: string) {
    await workspaceAccessService.requireMembership(workspaceId, userId, "owner");

    await workspaceAuditService.log({
      workspaceId,
      userId,
      action: "workspace_deleted",
      message: "Workspace deleted",
    });

    await prisma.workspace.delete({ where: { id: workspaceId } });
    return { ok: true };
  }

  async transferOwnership(
    workspaceId: string,
    ownerId: string,
    newOwnerUserId: string
  ) {
    await workspaceAccessService.requireMembership(workspaceId, ownerId, "owner");

    const target = await workspaceAccessService.getMembership(workspaceId, newOwnerUserId);
    if (!target) {
      throw new WorkspaceError(
        "NOT_FOUND",
        "New owner must already be a workspace member",
        404
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: newOwnerUserId },
      });
      await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: ownerId } },
        data: { role: "admin" },
      });
      await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: newOwnerUserId } },
        data: { role: "owner" },
      });
    });

    await workspaceAuditService.log({
      workspaceId,
      userId: ownerId,
      action: "ownership_transferred",
      message: "Workspace ownership transferred",
      metadata: { newOwnerUserId },
    });

    return { ok: true, newOwnerUserId };
  }
}

export const workspaceService = new WorkspaceService();
