import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { AgentError } from "@nebula/shared";
import { buildService, BuildServiceError } from "../services/build.service";
import { requireQuota } from "../middleware/quota";
import { rateLimitByUser } from "../middleware/rate-limit";
import { captureRouteError } from "../services/stability/error-capture";

export async function buildRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post(
    "/projects/:projectId/clarify",
    { preHandler: [rateLimitByUser("ai"), requireQuota("ai_request")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const result = await buildService.runClarifier(projectId, userId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof BuildServiceError || err instanceof AgentError) {
        captureRouteError("ai_provider", err, {
          userId,
          projectId,
          code: err.code,
        });
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  }
  );

  app.post(
    "/projects/:projectId/build",
    { preHandler: [rateLimitByUser("ai"), requireQuota("builder_run")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const body = (request.body as { message?: string }) ?? {};

    try {
      const result = await buildService.runBuilder(
        projectId,
        userId,
        body.message
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof BuildServiceError || err instanceof AgentError) {
        captureRouteError("ai_provider", err, {
          userId,
          projectId,
          code: err.code,
        });
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  }
  );

  app.post(
    "/projects/:projectId/run",
    { preHandler: [rateLimitByUser("ai"), requireQuota("ai_request")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const body = (request.body as { message?: string }) ?? {};

    buildService.schedulePipeline(projectId, userId, body.message);

    return reply.status(202).send({
      status: "accepted",
      message: "Build pipeline started",
    });
  }
  );
}
