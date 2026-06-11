import { Sandbox } from "e2b";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { eventService } from "../event.service";
import { SseEvents } from "@nebula/shared";

export class PreviewSyncService {
  private syncing = new Set<string>();

  async syncProjectFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>
  ): Promise<{ synced: boolean; fileCount: number }> {
    if (!env.E2B_API_KEY || files.length === 0) {
      return { synced: false, fileCount: 0 };
    }

    const preview = await prisma.preview.findUnique({
      where: { projectId },
      select: { sandboxId: true, status: true },
    });

    if (!preview?.sandboxId || preview.status !== "ready") {
      return { synced: false, fileCount: 0 };
    }

    if (this.syncing.has(projectId)) {
      return { synced: false, fileCount: 0 };
    }

    this.syncing.add(projectId);
    try {
      const sandbox = await Sandbox.connect(preview.sandboxId, {
        apiKey: env.E2B_API_KEY,
      });

      for (const file of files) {
        const normalized = file.path.replace(/\\/g, "/");
        await sandbox.files.write(normalized, file.content);
      }

      eventService.publish(projectId, SseEvents.PREVIEW_PHASE, {
        previewId: preview.sandboxId,
        phase: "synced",
        fileCount: files.length,
        message: `Hot-reloaded ${files.length} file(s)`,
      });

      return { synced: true, fileCount: files.length };
    } catch (err) {
      console.warn(`[preview-sync] Failed for ${projectId}:`, err);
      return { synced: false, fileCount: 0 };
    } finally {
      this.syncing.delete(projectId);
    }
  }

  scheduleSync(
    projectId: string,
    files: Array<{ path: string; content: string }>
  ) {
    if (files.length === 0) return;
    setImmediate(() => {
      void this.syncProjectFiles(projectId, files);
    });
  }
}

export const previewSyncService = new PreviewSyncService();
