import { env } from "../../config/env";
import { getRedis, isRedisEnabled } from "../../lib/redis";

type RateLimitBucket =
  | "login"
  | "register"
  | "ai"
  | "preview"
  | "github"
  | "api";

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

const LIMITS: Record<RateLimitBucket, number> = {
  login: env.RATE_LIMIT_LOGIN_PER_MIN,
  register: env.RATE_LIMIT_REGISTER_PER_MIN,
  ai: env.RATE_LIMIT_AI_PER_MIN,
  preview: env.RATE_LIMIT_PREVIEW_PER_MIN,
  github: env.RATE_LIMIT_GITHUB_PER_MIN,
  api: env.RATE_LIMIT_API_PER_MIN,
};

function windowKey(bucket: RateLimitBucket, id: string): string {
  return `${bucket}:${id}`;
}

export class RateLimitExceededError extends Error {
  constructor(public retryAfterSec: number) {
    super("Too many requests. Please try again later.");
  }
}

export class RateLimitService {
  async check(bucket: RateLimitBucket, identifier: string): Promise<void> {
    const limit = LIMITS[bucket];
    const key = windowKey(bucket, identifier);
    const windowSec = 60;

    if (isRedisEnabled()) {
      const redis = getRedis();
      if (redis) {
        const redisKey = `rl:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.expire(redisKey, windowSec);
        }
        if (count > limit) {
          const ttl = await redis.ttl(redisKey);
          throw new RateLimitExceededError(Math.max(ttl, 1));
        }
        return;
      }
    }

    const now = Date.now();
    const windowMs = windowSec * 1000;
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      throw new RateLimitExceededError(
        Math.ceil((entry.resetAt - now) / 1000)
      );
    }
  }

  checkSync(bucket: RateLimitBucket, identifier: string): void {
    const limit = LIMITS[bucket];
    const key = windowKey(bucket, identifier);
    const now = Date.now();
    const windowMs = 60_000;

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      throw new RateLimitExceededError(
        Math.ceil((entry.resetAt - now) / 1000)
      );
    }
  }

  getLimits() {
    return { ...LIMITS };
  }
}

export const rateLimitService = new RateLimitService();
