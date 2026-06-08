import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { eventService } from "../event.service";
import { SseEvents } from "@nebula/shared";
import type { PreviewLogLevel, PreviewLogSource } from "@nebula/shared";

export interface AppendLogInput {
  projectId: string;
  previewId: string;
  level: PreviewLogLevel;
  source: PreviewLogSource;
  message: string;
}

export class PreviewLogStore {
  async append(input: AppendLogInput): Promise<void> {
    const entry = {
      id: randomUUID(),
      previewId: input.previewId,
      level: input.level,
      source: input.source,
      message: input.message.slice(0, 16_000),
      createdAt: new Date(),
    };

    try {
      await prisma.previewLog.create({
        data: {
          id: entry.id,
          previewId: entry.previewId,
          level: entry.level,
          source: entry.source,
          message: entry.message,
        },
      });
    } catch (err) {
      console.warn("[preview-log] persist failed:", err);
    }

    eventService.publish(input.projectId, SseEvents.PREVIEW_LOG, {
      id: entry.id,
      previewId: entry.previewId,
      level: entry.level,
      source: entry.source,
      message: entry.message,
      createdAt: entry.createdAt.toISOString(),
    });
  }

  async appendCommandOutput(
    projectId: string,
    previewId: string,
    source: PreviewLogSource,
    stdout: string,
    stderr: string,
    exitCode: number
  ): Promise<void> {
    const chunks = [
      ...stdout.split("\n").filter(Boolean).map((line) => ({ level: "stdout" as const, line })),
      ...stderr.split("\n").filter(Boolean).map((line) => ({ level: "stderr" as const, line })),
    ];

    for (const chunk of chunks.slice(-200)) {
      await this.append({
        projectId,
        previewId,
        level: chunk.level,
        source,
        message: chunk.line,
      });
    }

    if (exitCode !== 0) {
      await this.append({
        projectId,
        previewId,
        level: "error",
        source,
        message: `Command exited with code ${exitCode}`,
      });
    }
  }

  async list(previewId: string, since?: Date, limit = 500) {
    return prisma.previewLog.findMany({
      where: {
        previewId,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        previewId: true,
        level: true,
        source: true,
        message: true,
        createdAt: true,
      },
    });
  }
}

export const previewLogStore = new PreviewLogStore();
