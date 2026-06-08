import { env } from "../../config/env";

type RateLimitBucket =
  | "login"
  | "register"
  | "ai"
  | "preview"
  | "github";

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
};

function windowKey(bucket: RateLimitBucket, id: string): string {
  return `${bucket}:${id}`;
}

export class RateLimitExceededError extends Error {
  constructor(
    public retryAfterSec: number
  ) {
    super("Too many requests. Please try again later.");
  }
}

export class RateLimitService {
  check(bucket: RateLimitBucket, identifier: string): void {
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
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new RateLimitExceededError(retryAfterSec);
    }
  }

  getLimits() {
    return { ...LIMITS };
  }
}

export const rateLimitService = new RateLimitService();
