import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@nebula/shared";
import { authService, AuthError } from "../services/auth.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { setSessionCookie, clearSessionCookie } from "../lib/session-cookie";
import { supabaseAuthService } from "../services/auth/supabase-auth.service";
import { prisma } from "../lib/prisma";
import { z } from "zod";

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
      setSessionCookie(reply, result.token);
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
      setSessionCookie(reply, result.token);
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
      clearSessionCookie(reply);
      return reply.status(204).send();
    }
  );

  app.post("/auth/supabase/exchange", async (request, reply) => {
    const parsed = z
      .object({ accessToken: z.string().min(1) })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await supabaseAuthService.exchangeAccessToken(
        parsed.data.accessToken
      );
      setSessionCookie(reply, result.token);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.get(
    "/users/me/rules",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { agentRules: true },
      });
      return reply.send({ agentRules: user?.agentRules ?? null });
    }
  );

  app.patch(
    "/users/me/rules",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const parsed = z
        .object({ agentRules: z.string().max(20_000).nullable() })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        });
      }
      const user = await prisma.user.update({
        where: { id: userId },
        data: { agentRules: parsed.data.agentRules?.trim() || null },
        select: { agentRules: true },
      });
      return reply.send({ agentRules: user.agentRules });
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
