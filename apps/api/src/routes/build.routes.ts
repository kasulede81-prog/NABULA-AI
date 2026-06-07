import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { AgentError } from "@nebula/shared";
import { buildService, BuildServiceError } from "../services/build.service";

export async function buildRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/projects/:projectId/clarify", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const result = await buildService.runClarifier(projectId, userId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof BuildServiceError || err instanceof AgentError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/build", async (request, reply) => {
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
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/run", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const body = (request.body as { message?: string }) ?? {};

    buildService.schedulePipeline(projectId, userId, body.message);

    return reply.status(202).send({
      status: "accepted",
      message: "Build pipeline started",
    });
  });
}
