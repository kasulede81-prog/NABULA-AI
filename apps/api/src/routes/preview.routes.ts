import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { previewService, PreviewError } from "../services/preview.service";

export async function previewRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/projects/:projectId/preview", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await previewService.validateReadyForPreview(projectId, userId);
      previewService.scheduleStart(projectId, userId);

      return reply.status(202).send({
        status: "accepted",
        message: "Preview provisioning started",
      });
    } catch (err) {
      if (err instanceof PreviewError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get("/projects/:projectId/preview", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const preview = await previewService.get(projectId, userId);
      return { data: preview };
    } catch (err) {
      if (err instanceof PreviewError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.delete("/projects/:projectId/preview", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await previewService.stop(projectId, userId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof PreviewError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
