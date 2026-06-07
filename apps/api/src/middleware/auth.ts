import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/jwt";
import { authService } from "../services/auth.service";

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  sessionId: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
    });
    return;
  }

  const token = header.slice(7);

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
