import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "./auth";
import {
  rateLimitService,
  RateLimitExceededError,
} from "../services/stability/rate-limit.service";

type RateLimitBucket = "login" | "register" | "ai" | "preview" | "github";

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.ip;
}

export function rateLimit(bucket: RateLimitBucket, keyFn?: (req: FastifyRequest) => string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const id = keyFn ? keyFn(request) : clientIp(request);
    try {
      rateLimitService.check(bucket, id);
    } catch (err) {
      if (err instanceof RateLimitExceededError) {
        return reply
          .status(429)
          .header("Retry-After", String(err.retryAfterSec))
          .send({
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: err.message,
              retryAfterSec: err.retryAfterSec,
            },
          });
      }
      throw err;
    }
  };
}

export function rateLimitByUser(bucket: RateLimitBucket) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request as AuthenticatedRequest;
    try {
      rateLimitService.check(bucket, userId);
    } catch (err) {
      if (err instanceof RateLimitExceededError) {
        return reply
          .status(429)
          .header("Retry-After", String(err.retryAfterSec))
          .send({
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: err.message,
              retryAfterSec: err.retryAfterSec,
            },
          });
      }
      throw err;
    }
  };
}
