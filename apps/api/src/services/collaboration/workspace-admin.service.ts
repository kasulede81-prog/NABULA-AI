import { prisma } from "../../lib/prisma";

export class WorkspaceAdminService {
  async getStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalWorkspaces, activeWorkspaces, workspaceMembers, workspaceProjects] =
      await Promise.all([
        prisma.workspace.count(),
        prisma.workspace.count({
          where: {
            OR: [
              { projects: { some: { updatedAt: { gte: thirtyDaysAgo } } } },
              { members: { some: { createdAt: { gte: thirtyDaysAgo } } } },
            ],
          },
        }),
        prisma.workspaceMember.count(),
        prisma.project.count({ where: { workspaceId: { not: null } } }),
      ]);

    return {
      totalWorkspaces,
      activeWorkspaces,
      workspaceMembers,
      workspaceProjects,
    };
  }
}

export const workspaceAdminService = new WorkspaceAdminService();
