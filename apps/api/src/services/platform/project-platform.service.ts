import type { WorkspaceMemberRole } from "@nebula/database";
import { prisma } from "../../lib/prisma";
import { encryptSecret, decryptSecret } from "../../lib/token-crypto";
import {
  workspaceAccessService,
  WorkspaceAccessError,
} from "../collaboration/workspace-access.service";

export class PlatformError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function handleAccess(err: unknown): never {
  if (err instanceof WorkspaceAccessError) {
    throw new PlatformError(err.code, err.message, err.status);
  }
  throw err;
}

export class ProjectPlatformService {
  private async getProject(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PlatformError("NOT_FOUND", "Project not found", 404);
    }
    return project;
  }

  private async requireAccess(
    userId: string,
    projectId: string,
    minRole: WorkspaceMemberRole = "member"
  ) {
    const project = await this.getProject(projectId);
    try {
      await workspaceAccessService.requireProjectAccess(userId, project, minRole);
    } catch (err) {
      handleAccess(err);
    }
    return project;
  }

  private async requireAdmin(userId: string, projectId: string) {
    const project = await this.getProject(projectId);
    if (project.userId === userId) return project;
    if (!project.workspaceId) {
      throw new PlatformError("FORBIDDEN", "Insufficient permissions", 403);
    }
    try {
      await workspaceAccessService.requireMembership(
        project.workspaceId,
        userId,
        "admin"
      );
    } catch (err) {
      handleAccess(err);
    }
    return project;
  }

  private decryptValue(stored: string): string {
    try {
      return decryptSecret(stored);
    } catch {
      return stored;
    }
  }

  // --- Env vars ---

  async listEnvVars(userId: string, projectId: string) {
    await this.requireAdmin(userId, projectId);
    const rows = await prisma.projectEnvVar.findMany({
      where: { projectId },
      orderBy: { key: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      value: this.decryptValue(r.value),
      environment: r.environment,
      isSecret: r.isSecret,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createEnvVar(
    userId: string,
    projectId: string,
    input: { key: string; value: string; environment?: string }
  ) {
    await this.requireAdmin(userId, projectId);
    const row = await prisma.projectEnvVar.create({
      data: {
        projectId,
        key: input.key.trim().toUpperCase(),
        value: encryptSecret(input.value),
        environment: input.environment ?? "production",
      },
    });
    return {
      id: row.id,
      key: row.key,
      value: input.value,
      environment: row.environment,
      isSecret: row.isSecret,
    };
  }

  async deleteEnvVar(userId: string, projectId: string, envVarId: string) {
    await this.requireAdmin(userId, projectId);
    const row = await prisma.projectEnvVar.findFirst({
      where: { id: envVarId, projectId },
    });
    if (!row) {
      throw new PlatformError("NOT_FOUND", "Environment variable not found", 404);
    }
    await prisma.projectEnvVar.delete({ where: { id: envVarId } });
  }

  // --- Domains ---

  async listDomains(userId: string, projectId: string) {
    await this.requireAccess(userId, projectId);
    return prisma.projectDomain.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  async addDomain(userId: string, projectId: string, host: string) {
    await this.requireAccess(userId, projectId, "admin");
    const clean = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(clean)) {
      throw new PlatformError("VALIDATION_ERROR", "Invalid domain format", 400);
    }
    return prisma.projectDomain.create({
      data: { projectId, host: clean, status: "pending" },
    });
  }

  async removeDomain(userId: string, projectId: string, domainId: string) {
    await this.requireAccess(userId, projectId, "admin");
    const row = await prisma.projectDomain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!row) {
      throw new PlatformError("NOT_FOUND", "Domain not found", 404);
    }
    await prisma.projectDomain.delete({ where: { id: domainId } });
  }

  async verifyDomain(userId: string, projectId: string, domainId: string) {
    await this.requireAccess(userId, projectId, "admin");
    const row = await prisma.projectDomain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!row) {
      throw new PlatformError("NOT_FOUND", "Domain not found", 404);
    }
    // Simulated DNS verification — marks active for demo parity with Lovable mock
    return prisma.projectDomain.update({
      where: { id: domainId },
      data: { status: "active" },
    });
  }

  // --- Notes ---

  async listNotes(
    userId: string,
    projectId: string,
    opts: { q?: string; page?: number; pageSize?: number }
  ) {
    await this.requireAccess(userId, projectId);
    const page = opts.page ?? 0;
    const pageSize = opts.pageSize ?? 8;
    const where = {
      projectId,
      ...(opts.q?.trim()
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" as const } },
              { content: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.projectNote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.projectNote.count({ where }),
    ]);
    return { rows, count, page, pageSize };
  }

  async upsertNote(
    userId: string,
    projectId: string,
    input: {
      id?: string;
      title: string;
      content: string;
      tags?: string[];
    }
  ) {
    await this.requireAccess(userId, projectId, "member");
    if (input.id) {
      const existing = await prisma.projectNote.findFirst({
        where: { id: input.id, projectId },
      });
      if (!existing) {
        throw new PlatformError("NOT_FOUND", "Note not found", 404);
      }
      return prisma.projectNote.update({
        where: { id: input.id },
        data: {
          title: input.title,
          content: input.content,
          tags: input.tags ?? [],
        },
      });
    }
    return prisma.projectNote.create({
      data: {
        projectId,
        userId,
        title: input.title || "Untitled",
        content: input.content ?? "",
        tags: input.tags ?? [],
      },
    });
  }

  async deleteNote(userId: string, projectId: string, noteId: string) {
    await this.requireAccess(userId, projectId, "member");
    const row = await prisma.projectNote.findFirst({
      where: { id: noteId, projectId },
    });
    if (!row) {
      throw new PlatformError("NOT_FOUND", "Note not found", 404);
    }
    await prisma.projectNote.delete({ where: { id: noteId } });
  }

  // --- Recordings ---

  async listRecordings(
    userId: string,
    projectId: string,
    opts: { q?: string; page?: number; pageSize?: number }
  ) {
    await this.requireAccess(userId, projectId);
    const page = opts.page ?? 0;
    const pageSize = opts.pageSize ?? 8;
    const where = {
      projectId,
      ...(opts.q?.trim()
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" as const } },
              { transcript: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.projectRecording.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.projectRecording.count({ where }),
    ]);
    return { rows, count, page, pageSize };
  }

  async upsertRecording(
    userId: string,
    projectId: string,
    input: {
      id?: string;
      title: string;
      durationSeconds?: number;
      transcript?: string;
    }
  ) {
    await this.requireAccess(userId, projectId, "member");
    if (input.id) {
      const existing = await prisma.projectRecording.findFirst({
        where: { id: input.id, projectId },
      });
      if (!existing) {
        throw new PlatformError("NOT_FOUND", "Recording not found", 404);
      }
      return prisma.projectRecording.update({
        where: { id: input.id },
        data: {
          title: input.title,
          durationSeconds: input.durationSeconds ?? 0,
          transcript: input.transcript ?? "",
        },
      });
    }
    return prisma.projectRecording.create({
      data: {
        projectId,
        userId,
        title: input.title || "Untitled",
        durationSeconds: input.durationSeconds ?? 0,
        transcript: input.transcript ?? "",
      },
    });
  }

  async deleteRecording(
    userId: string,
    projectId: string,
    recordingId: string
  ) {
    await this.requireAccess(userId, projectId, "member");
    const row = await prisma.projectRecording.findFirst({
      where: { id: recordingId, projectId },
    });
    if (!row) {
      throw new PlatformError("NOT_FOUND", "Recording not found", 404);
    }
    await prisma.projectRecording.delete({ where: { id: recordingId } });
  }
}

export const projectPlatformService = new ProjectPlatformService();
