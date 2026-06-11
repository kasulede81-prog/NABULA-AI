import type { FastifyRequest } from "fastify";
import { verifyToken } from "./jwt";
import { authService } from "../services/auth.service";

export async function authenticateWebSocket(
  request: FastifyRequest
): Promise<{ userId: string } | null> {
  const query = request.query as { token?: string };
  const header = request.headers.authorization;
  const token =
    query.token ??
    (header?.startsWith("Bearer ") ? header.slice(7) : undefined);

  if (!token) return null;

  try {
    const payload = verifyToken(token);
    const user = await authService.validateSession(payload.sessionId);
    if (!user || user.id !== payload.userId) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}
