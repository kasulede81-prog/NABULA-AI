import { prisma } from "../../lib/prisma";

/** Records GitHub repo creator/sync actor without modifying export logic. */
export class GithubTrackingService {
  async recordCreated(projectId: string, userId: string) {
    await prisma.githubRepository.updateMany({
      where: { projectId },
      data: { createdByUserId: userId },
    });
  }

  async recordSynced(projectId: string, userId: string) {
    await prisma.githubRepository.updateMany({
      where: { projectId },
      data: { lastSyncedByUserId: userId },
    });
  }
}

export const githubTrackingService = new GithubTrackingService();
