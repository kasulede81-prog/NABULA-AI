import { prisma } from "../../lib/prisma";

export class UserActivityService {
  async recordLogin(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async getActivity(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastLoginAt: true, createdAt: true },
    });

    const [projectsCreated, previewsLaunched, exportsPerformed] = await Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.usageEvent.count({
        where: { userId, eventType: "preview_launch" },
      }),
      prisma.usageEvent.count({
        where: { userId, eventType: "github_export" },
      }),
    ]);

    return {
      lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
      memberSince: user?.createdAt.toISOString() ?? null,
      projectsCreated,
      previewsLaunched,
      exportsPerformed,
    };
  }
}

export const userActivityService = new UserActivityService();
