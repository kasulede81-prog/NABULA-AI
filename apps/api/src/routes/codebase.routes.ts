import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { codeIndexService } from "../services/code-index.service";
import { semanticSearchService } from "../services/semantic-search.service";
import { fileHistoryService, FileHistoryError } from "../services/file-history.service";
import { vfsService, VfsError } from "../services/vfs.service";
import { projectService, ProjectError } from "../services/project.service";
import { prisma } from "../lib/prisma";

export async function codebaseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/codebase/search", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const { q = "", limit = "10" } = request.query as {
      q?: string;
      limit?: string;
    };

    try {
      await projectService.get(projectId, userId);
      const data = await semanticSearchService.search(
        projectId,
        userId,
        q,
        Math.min(Number(limit) || 10, 20)
      );
      return reply.send({ data });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get("/projects/:projectId/symbols", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const { q = "" } = request.query as { q?: string };

    try {
      await projectService.get(projectId, userId);
      const data = q.trim()
        ? await codeIndexService.searchSymbols(projectId, q)
        : await codeIndexService.listSymbols(projectId);
      return reply.send({ data });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get("/projects/:projectId/history/snapshots", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const page = await fileHistoryService.listSnapshots(projectId, userId);
      return reply.send(page);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get("/projects/:projectId/history", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const page = await fileHistoryService.listProjectTimeline(projectId, userId);
      return reply.send(page);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get("/projects/:projectId/files/*/history", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const filePath = (request.params as { "*": string })["*"];

    if (!filePath) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "File path required" },
      });
    }

    try {
      const data = await fileHistoryService.listFileHistory(
        projectId,
        userId,
        filePath
      );
      return reply.send(data);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/codebase/reindex", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await projectService.get(projectId, userId);
      const files = await prisma.file.findMany({
        where: { projectId },
        select: { path: true, content: true },
      });
      let indexed = 0;
      for (const file of files) {
        await codeIndexService.indexFile(projectId, file.path, file.content);
        indexed++;
      }
      return reply.send({ indexed });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/files/*/restore", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const filePath = (request.params as { "*": string })["*"];
    const body = request.body as { version?: number };

    if (!filePath || body.version == null) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "path and version required" },
      });
    }

    try {
      const archived = await fileHistoryService.readVersion(
        projectId,
        userId,
        filePath,
        body.version
      );
      const saved = await vfsService.writeFile(
        projectId,
        userId,
        filePath,
        archived.content,
        { source: "restore" }
      );
      return reply.send(saved);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof FileHistoryError || err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
