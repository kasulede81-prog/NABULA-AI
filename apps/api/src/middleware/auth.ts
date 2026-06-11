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
): Promise<void> {
  const token = readSessionToken(request);
  if (!token) {
    reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
    });
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await authService.validateSession(payload.sessionId);

    if (!user || user.id !== payload.userId) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired session" },
      });
      return;
    }

    (request as AuthenticatedRequest).userId = user.id;
    (request as AuthenticatedRequest).sessionId = payload.sessionId;
  } catch {
    reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }
}
