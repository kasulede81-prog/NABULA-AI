import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@nebula/shared";
import { authService, AuthError } from "../services/auth.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/register",
    { preHandler: rateLimit("register") },
    async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await authService.register(parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  }
  );

  app.post(
    "/auth/login",
    { preHandler: rateLimit("login") },
    async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await authService.login(parsed.data);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  }
  );

  app.post(
    "/auth/logout",
    { preHandler: authenticate },
    async (request, reply) => {
      const { sessionId } = request as AuthenticatedRequest;
      await authService.logout(sessionId);
      return reply.status(204).send();
    }
  );

  app.get(
    "/auth/me",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      try {
        const user = await authService.getMe(userId);
        return reply.send(user);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.status(err.status).send({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    }
  );
}
