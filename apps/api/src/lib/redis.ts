import Redis from "ioredis";
import { env } from "../config/env";

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

export function getRedis(): Redis | null {
  if (!isRedisEnabled()) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    client.on("error", (err) => {
      console.warn("[redis] connection error:", err.message);
    });
  }
  return client;
}

export function getRedisSubscriber(): Redis | null {
  if (!isRedisEnabled()) return null;
  if (!subscriber) {
    subscriber = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    subscriber.on("error", (err) => {
      console.warn("[redis] subscriber error:", err.message);
    });
  }
  return subscriber;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  const sub = getRedisSubscriber();
  if (redis && redis.status !== "ready") {
    await redis.connect().catch(() => undefined);
  }
  if (sub && sub.status !== "ready") {
    await sub.connect().catch(() => undefined);
  }
}

export const RedisChannels = {
  events: (projectId: string) => `nebula:events:${projectId}`,
  agentQueueTick: "nebula:agent-queue:tick",
} as const;
