import type { FastifyInstance } from "fastify";
import { vfsPathSchema } from "@nebula/shared";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { pendingChangesetService } from "../services/pending-changeset.service";
import { projectService, ProjectError } from "../services/project.service";

export async function changesetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/changeset", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await projectService.get(projectId, userId);
      const files = await pendingChangesetService.getProposal(projectId);
      return reply.send({
        pending: files.length > 0,
        fileCount: files.length,
        files,
      });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/changeset/apply", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    const { paths } = (request.body ?? {}) as { paths?: string[] };

    try {
      await projectService.get(projectId, userId);
      const result = await pendingChangesetService.apply(
        projectId,
        userId,
        Array.isArray(paths) ? paths : undefined
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/changeset/stage", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const { path, content } = (request.body ?? {}) as {
      path?: string;
      content?: string;
    };

    const pathParsed = vfsPathSchema.safeParse(path);
    if (!pathParsed.success || typeof content !== "string") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "valid path and content are required",
        },
      });
    }

    try {
      await projectService.get(projectId, userId);
      const result = await pendingChangesetService.stageWrites(
        projectId,
        userId,
        [{ path: pathParsed.data, content }]
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/changeset/update", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const { path, content } = (request.body ?? {}) as {
      path?: string;
      content?: string;
    };

    const pathParsed = vfsPathSchema.safeParse(path);
    if (!pathParsed.success || typeof content !== "string") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "valid path and content are required",
        },
      });
    }

    try {
      await projectService.get(projectId, userId);
      const result = await pendingChangesetService.updateStaged(
        projectId,
        pathParsed.data,
        content
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/changeset/discard", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    const { paths } = (request.body ?? {}) as { paths?: string[] };

    try {
      await projectService.get(projectId, userId);
      const result = await pendingChangesetService.discard(
        projectId,
        Array.isArray(paths) ? paths : undefined
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
