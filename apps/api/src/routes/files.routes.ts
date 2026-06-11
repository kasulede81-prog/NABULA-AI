import type { FastifyInstance } from "fastify";
import { renameFileSchema, writeFileSchema } from "@nebula/shared";
import { decodePathCursor, parseCursorQuery } from "../lib/cursor-pagination";
import { vfsService, VfsError } from "../services/vfs.service";
import {
  analyticsService,
  WorkspaceMetricEvents,
} from "../services/analytics.service";
import { aiEditService, AiEditError, aiEditSchema } from "../services/ai-edit.service";
import {
  tabCompletionService,
  tabCompletionSchema,
} from "../services/tab-completion.service";
import { projectService, ProjectError } from "../services/project.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/files/search", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const { q = "" } = request.query as { q?: string };

    try {
      const data = await vfsService.searchFiles(projectId, userId, q);
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

  app.get("/projects/:projectId/files", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const query = request.query as { cursor?: string; limit?: string };
      const pagination = parseCursorQuery(query);
      const page = await vfsService.listTreePaginated(projectId, userId, {
        ...pagination,
        pathCursor: decodePathCursor(query.cursor),
      });
      return reply.send({ data: page.items, nextCursor: page.nextCursor });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/files/bulk-read", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const body = request.body as { paths?: unknown };
    const paths = Array.isArray(body?.paths)
      ? body.paths.filter((p): p is string => typeof p === "string").slice(0, 500)
      : null;
    if (!paths) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "paths array required" },
      });
    }

    try {
      const data = await vfsService.readFilesBulk(projectId, userId, paths);
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

  app.get("/projects/:projectId/files/*", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string; "*": string };
    const filePath = (request.params as { "*": string })["*"];

    if (!filePath) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "File path required" },
      });
    }

    try {
      const { version } = request.query as { version?: string };
      const versionNum = version ? Number.parseInt(version, 10) : undefined;
      const file = await vfsService.readFile(
        projectId,
        userId,
        filePath,
        Number.isFinite(versionNum) ? versionNum : undefined
      );
      // Fire-and-forget: analytics must not add a DB roundtrip to file reads.
      void analyticsService
        .track(WorkspaceMetricEvents.FILES_OPENED, userId, projectId, {
          path: filePath,
        })
        .catch(() => undefined);
      return reply.send(file);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/files", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = writeFileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const file = await vfsService.writeFile(
        projectId,
        userId,
        parsed.data.path,
        parsed.data.content
      );
      await analyticsService.track(
        WorkspaceMetricEvents.FILES_SAVED,
        userId,
        projectId,
        { path: parsed.data.path }
      );
      return reply.status(201).send(file);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.patch("/projects/:projectId/files/rename", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = renameFileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const file = await vfsService.renameFile(
        projectId,
        userId,
        parsed.data.fromPath,
        parsed.data.toPath
      );
      return reply.send(file);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/files/ai-edit", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = aiEditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await aiEditService.proposeEdit(
        projectId,
        userId,
        parsed.data.path,
        parsed.data.instruction,
        parsed.data.selectedText
      );
      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof AiEditError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/files/tab-completion", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = tabCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await tabCompletionService.complete(
        projectId,
        userId,
        parsed.data
      );
      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      // Completions are best-effort: never surface provider errors to the editor.
      return reply.send({ data: { completion: "" } });
    }
  });

  app.post("/projects/:projectId/files/ai-edit/apply", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = writeFileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const file = await aiEditService.applyEdit(
        projectId,
        userId,
        parsed.data.path,
        parsed.data.content
      );
      return reply.send(file);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.delete("/projects/:projectId/files/*", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const filePath = (request.params as { "*": string })["*"];

    if (!filePath) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "File path required" },
      });
    }

    try {
      const result = await vfsService.deleteFile(projectId, userId, filePath);
      return reply.send(result);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof VfsError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
