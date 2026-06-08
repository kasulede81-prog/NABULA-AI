import type { FastifyInstance } from "fastify";
import { createMessageSchema } from "@nebula/shared";
import { parseCursorQuery } from "../lib/cursor-pagination";
import { messageService } from "../services/message.service";
import { projectService, ProjectError } from "../services/project.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireQuota } from "../middleware/quota";
import { rateLimitByUser } from "../middleware/rate-limit";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/messages", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const pagination = parseCursorQuery(
        request.query as { cursor?: string; limit?: string }
      );
      const page = await messageService.list(projectId, userId, pagination);
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

  app.post(
    "/projects/:projectId/messages",
    { preHandler: [rateLimitByUser("ai"), requireQuota("ai_request")] },
    async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = createMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const message = await messageService.create(
        projectId,
        userId,
        parsed.data
      );
      return reply.status(201).send(message);
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
