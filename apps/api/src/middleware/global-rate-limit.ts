import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  RateLimitExceededError,
  rateLimitService,
} from "../services/stability/rate-limit.service";

const SKIP_PREFIXES = [
  "/v1/health",
  "/v1/webhooks/stripe",
  "/v1/events",
  "/v1/integrations",
  "/v1/auth/oauth/config",
  "/v1/auth/supabase/exchange",
];

export async function registerGlobalRateLimit(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;

    const userId = (request as { userId?: string }).userId;
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      request.ip;
    const identifier = userId ?? ip ?? "anonymous";

    try {
      await rateLimitService.check("api", identifier);
    } catch (err) {
      if (err instanceof RateLimitExceededError) {
        reply.header("Retry-After", String(err.retryAfterSec));
        return reply.status(429).send({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: err.message,
          },
        });
      }
      throw err;
    }
  });
}
