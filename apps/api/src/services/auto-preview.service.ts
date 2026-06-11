import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { previewService } from "./preview.service";
import { previewSyncService } from "./preview/preview-sync.service";
import { vfsService } from "./vfs.service";

export class AutoPreviewService {
  isEnabled() {
    return Boolean(env.E2B_API_KEY?.trim()) && env.AUTO_PREVIEW_ENABLED;
  }

  async scheduleAfterBuild(
    projectId: string,
    userId: string,
    reason: string
  ) {
    if (!this.isEnabled()) return;
    if (!previewService.isConfigured()) return;

    const preview = await prisma.preview.findUnique({
      where: { projectId },
      select: { status: true, sandboxId: true },
    });

    if (preview?.status === "ready" && preview.sandboxId) {
      const files = await vfsService.snapshot(projectId, userId);
      const result = await previewSyncService.syncProjectFiles(
        projectId,
        files.map((f) => ({ path: f.path, content: f.content }))
      );
      if (result.synced) {
        console.info(
          `[auto-preview] Hot-synced ${result.fileCount} files for ${projectId} (${reason})`
        );
        return;
      }
    }

    try {
      previewService.scheduleStart(projectId, userId);
      console.info(`[auto-preview] Cold start for ${projectId} (${reason})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("PREVIEW_IN_PROGRESS")) {
        console.warn(`[auto-preview] Failed for ${projectId}:`, msg);
      }
    }
  }
}

export const autoPreviewService = new AutoPreviewService();
