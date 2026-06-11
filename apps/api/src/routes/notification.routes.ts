import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { notificationService } from "../services/notification.service";
import { projectService, ProjectError } from "../services/project.service";

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/notifications", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      await projectService.get(projectId, userId);
      const page = await notificationService.list(projectId, userId);
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

  app.post(
    "/projects/:projectId/notifications/read-all",
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      try {
        await projectService.get(projectId, userId);
        const result = await notificationService.markAllRead(projectId, userId);
        return reply.send(result);
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

  app.post(
    "/projects/:projectId/notifications/:notificationId/read",
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId, notificationId } = request.params as {
        projectId: string;
        notificationId: string;
      };

      try {
        await projectService.get(projectId, userId);
        const result = await notificationService.markRead(
          projectId,
          userId,
          notificationId
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
    }
  );
}
