import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { previewService, PreviewError } from "../services/preview.service";
import { requireQuota, consumeQuota } from "../middleware/quota";
import { QuotaExceededError } from "../services/billing/billing.service";
import { rateLimitByUser } from "../middleware/rate-limit";
import { captureRouteError } from "../services/stability/error-capture";
import { previewSyncService } from "../services/preview/preview-sync.service";
import { vfsService } from "../services/vfs.service";

function handlePreviewError(
  err: unknown,
  reply: import("fastify").FastifyReply,
  context?: { userId?: string; projectId?: string }
) {
  if (err instanceof PreviewError) {
    captureRouteError("preview", err, {
      userId: context?.userId,
      projectId: context?.projectId,
      code: err.code,
    });
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

export async function previewRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post(
    "/previews/create",
    { preHandler: [rateLimitByUser("preview"), requireQuota("preview_launch")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.body as { projectId: string };

    if (!projectId) {
      return reply.status(400).send({
        error: { code: "INVALID_REQUEST", message: "projectId is required" },
      });
    }

    try {
      // requireQuota already asserted; charge only once the launch is
      // actually accepted (validation failures must not consume credits).
      const result = await previewService.create(projectId, userId);
      await consumeQuota(userId, "preview_launch", projectId);
      return reply.status(202).send({
        status: result.status,
        previewId: result.previewId,
        message: "Preview provisioning started",
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      return handlePreviewError(err, reply, { userId, projectId });
    }
  });

  app.get("/previews/:id/status", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    try {
      const status = await previewService.getStatus(id, userId);
      if (!status) {
        return reply.status(404).send({
          error: { code: "PREVIEW_NOT_FOUND", message: "Preview not found" },
        });
      }
      return { data: status };
    } catch (err) {
      return handlePreviewError(err, reply);
    }
  });

  app.get("/previews/:id/logs", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const { since } = request.query as { since?: string };

    try {
      const record = await previewService.getById(id, userId);
      if (!record) {
        return reply.status(404).send({
          error: { code: "PREVIEW_NOT_FOUND", message: "Preview not found" },
        });
      }

      const logs = await previewService.getLogs(id, userId, since);
      return { data: logs };
    } catch (err) {
      return handlePreviewError(err, reply);
    }
  });

  app.delete("/previews/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    try {
      await previewService.stopById(id, userId);
      return reply.status(204).send();
    } catch (err) {
      return handlePreviewError(err, reply);
    }
  });

  app.post(
    "/projects/:projectId/preview",
    { preHandler: [rateLimitByUser("preview"), requireQuota("preview_launch")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      // requireQuota already asserted; charge only once the launch is
      // actually accepted (validation failures must not consume credits).
      const result = await previewService.create(projectId, userId);
      await consumeQuota(userId, "preview_launch", projectId);
      return reply.status(202).send({
        status: result.status,
        previewId: result.previewId,
        message: "Preview provisioning started",
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      return handlePreviewError(err, reply, { userId, projectId });
    }
  });

  app.get("/projects/:projectId/preview", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const preview = await previewService.get(projectId, userId);
      return { data: preview };
    } catch (err) {
      return handlePreviewError(err, reply, { userId, projectId });
    }
  });

  app.post("/projects/:projectId/preview/sync", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const files = await vfsService.snapshot(projectId, userId);
      const result = await previewSyncService.syncProjectFiles(
        projectId,
        files.map((f) => ({ path: f.path, content: f.content }))
      );
      return { data: result };
    } catch (err) {
      return handlePreviewError(err, reply, { userId, projectId });
    }
  });

  app.delete("/projects/:projectId/preview", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await previewService.stop(projectId, userId);
      return reply.status(204).send();
    } catch (err) {
      return handlePreviewError(err, reply, { userId, projectId });
    }
  });
}
