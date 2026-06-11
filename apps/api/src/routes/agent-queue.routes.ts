import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { agentQueueService } from "../services/agent-queue.service";
import { projectService, ProjectError } from "../services/project.service";

export async function agentQueueRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/agent-queue", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await projectService.get(projectId, userId);
      const data = await agentQueueService.listForProject(projectId);
      const pending = data.filter((j) => j.status === "pending").length;
      return reply.send({ data, pending });
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
