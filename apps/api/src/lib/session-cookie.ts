import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";

export const SESSION_COOKIE = "nebula_session";

const MAX_AGE_SEC = 7 * 24 * 60 * 60;

export function setSessionCookie(reply: FastifyReply, token: string) {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  void reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function readSessionToken(request: FastifyRequest): string | null {
  const cookies = request.cookies as Record<string, string | undefined>;
  const fromCookie = cookies[SESSION_COOKIE];
  if (fromCookie) return fromCookie;

  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
}
