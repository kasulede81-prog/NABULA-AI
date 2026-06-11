import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { rateLimitByUser } from "../middleware/rate-limit";
import {
  aiAssistService,
  terminalCommandSchema,
  quickFixSchema,
} from "../services/ai-assist.service";
import { fileHistoryService } from "../services/file-history.service";
import { projectService, ProjectError } from "../services/project.service";

const restoreSchema = z.object({
  at: z.string().datetime(),
});

export async function aiAssistRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post(
    "/projects/:projectId/ai/terminal-command",
    { preHandler: rateLimitByUser("ai") },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };
      const parsed = terminalCommandSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        });
      }

      try {
        const result = await aiAssistService.terminalCommand(
          projectId,
          userId,
          parsed.data.instruction
        );
        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof ProjectError) {
          return reply.status(err.status).send({
            error: { code: err.code, message: err.message },
          });
        }
        return reply.send({ data: { command: "" } });
      }
    }
  );

  app.post(
    "/projects/:projectId/ai/quick-fix",
    { preHandler: rateLimitByUser("ai") },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };
      const parsed = quickFixSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        });
      }

      try {
        const result = await aiAssistService.quickFix(
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
        throw err;
      }
    }
  );

  app.post("/projects/:projectId/restore", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      await projectService.get(projectId, userId);
      const result = await fileHistoryService.restoreToTimestamp(
        projectId,
        userId,
        new Date(parsed.data.at)
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
