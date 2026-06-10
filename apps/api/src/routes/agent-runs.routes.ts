import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import {
  agentRunQueryService,
} from "../services/agent-run-query.service";
import { projectService, ProjectError } from "../services/project.service";

export async function agentRunRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/agent-runs", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const runs = await agentRunQueryService.list(projectId, userId);
      return reply.send({
        data: runs,
        active: agentRunQueryService.isActive(projectId),
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

  app.post(
    "/projects/:projectId/agent-runs/:runId/cancel",
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId, runId } = request.params as {
        projectId: string;
        runId: string;
      };

      try {
        const run = await agentRunQueryService.cancel(
          projectId,
          userId,
          runId
        );
        return reply.send({ data: run });
      } catch (err) {
        if (err instanceof ProjectError) {
          return reply.status(err.status).send({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    }
  );
}
