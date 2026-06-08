import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { supportService, SupportError } from "../services/support/support.service";

const messageSchema = z.object({
  message: z.string().min(1, "Message is required").max(4000),
});

function handleSupportError(
  err: unknown,
  reply: import("fastify").FastifyReply
) {
  if (err instanceof SupportError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

export async function supportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/support/notifications", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const data = await supportService.getUserNotifications(userId);
    return { data };
  });

  app.get("/support/conversation", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    try {
      const data = await supportService.getConversation(userId);
      await supportService.markReadByUser(userId);
      return { data };
    } catch (err) {
      return handleSupportError(err, reply);
    }
  });

  app.post("/support/messages", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const data = await supportService.sendUserMessage(
        userId,
        parsed.data.message
      );
      return reply.status(201).send({ data });
    } catch (err) {
      return handleSupportError(err, reply);
    }
  });

  app.post("/support/upgrade-request", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    try {
      const data = await supportService.requestUpgrade(userId, "pro");
      return reply.status(201).send({ data });
    } catch (err) {
      return handleSupportError(err, reply);
    }
  });
}
