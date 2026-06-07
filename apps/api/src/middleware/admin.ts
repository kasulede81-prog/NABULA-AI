import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "./auth";

function parseAdminEmails(): Set<string> {
  const raw = env.ADMIN_EMAILS.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { userId } = request as AuthenticatedRequest;
  const admins = parseAdminEmails();

  if (admins.size === 0) {
    reply.status(503).send({
      error: {
        code: "ADMIN_NOT_CONFIGURED",
        message: "ADMIN_EMAILS is not configured",
      },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user || !admins.has(user.email.toLowerCase())) {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  }
}
