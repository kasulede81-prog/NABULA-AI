import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import {
  feedbackService,
  FeedbackError,
} from "../services/stability/feedback.service";

const feedbackSchema = z.object({
  category: z.enum(["bug", "feature", "general", "other"]).default("general"),
  message: z.string().min(1).max(4000),
});

export async function stabilityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/feedback", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const data = await feedbackService.submit(
        userId,
        parsed.data.category,
        parsed.data.message
      );
      return reply.status(201).send({ data });
    } catch (err) {
      if (err instanceof FeedbackError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
