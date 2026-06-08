import type { WorkspaceMemberRole } from "@nebula/database";
import { prisma } from "../../lib/prisma";

const ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export class WorkspaceAccessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export class WorkspaceAccessService {
  async getMembership(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  async requireMembership(
    workspaceId: string,
    userId: string,
    minRole: WorkspaceMemberRole = "member"
  ) {
    const member = await this.getMembership(workspaceId, userId);
    if (!member) {
      throw new WorkspaceAccessError(
        "FORBIDDEN",
        "You are not a member of this workspace",
        403
      );
    }
    if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
      throw new WorkspaceAccessError(
        "FORBIDDEN",
        "Insufficient workspace permissions",
        403
      );
    }
    return member;
  }

  async getMemberWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    return rows.map((r) => r.workspaceId);
  }

  async canAccessProject(userId: string, project: { userId: string; workspaceId: string | null }) {
    if (project.userId === userId) return true;
    if (!project.workspaceId) return false;
    const member = await this.getMembership(project.workspaceId, userId);
    return !!member;
  }

  async requireProjectAccess(
    userId: string,
    project: { userId: string; workspaceId: string | null },
    minRole: WorkspaceMemberRole = "member"
  ) {
    if (project.userId === userId) return { role: "owner" as WorkspaceMemberRole };
    if (!project.workspaceId) {
      throw new WorkspaceAccessError("NOT_FOUND", "Project not found", 404);
    }
    const member = await this.requireMembership(project.workspaceId, userId, minRole);
    return member;
  }

  async requireProjectDelete(userId: string, project: { userId: string; workspaceId: string | null }) {
    if (project.userId === userId) return;
    if (!project.workspaceId) {
      throw new WorkspaceAccessError("NOT_FOUND", "Project not found", 404);
    }
    await this.requireMembership(project.workspaceId, userId, "admin");
  }

  canManageGithub(role: WorkspaceMemberRole): boolean {
    return ROLE_RANK[role] >= ROLE_RANK.member;
  }
}

export const workspaceAccessService = new WorkspaceAccessService();
