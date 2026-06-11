import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/jwt";
import { readSessionToken } from "../lib/session-cookie";
import { authService } from "../services/auth.service";

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  sessionId: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  const token = readSessionToken(request);
  if (!token) {
    // Returning the reply makes Fastify stop the lifecycle — without it the
    // route handler can still run after the 401 was sent.
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
    });
  }

  try {
    const payload = verifyToken(token);
    const user = await authService.validateSession(payload.sessionId);

    if (!user || user.id !== payload.userId) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired session" },
      });
    }

    (request as AuthenticatedRequest).userId = user.id;
    (request as AuthenticatedRequest).sessionId = payload.sessionId;
  } catch {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }
}
