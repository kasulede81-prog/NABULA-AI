import { getRedis, isRedisEnabled } from "./redis";

export async function acquireRedisLock(
  key: string,
  ttlSec = 3600
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isRedisEnabled()) return true;
  const result = await redis.set(key, "1", "EX", ttlSec, "NX");
  return result === "OK";
}

export async function releaseRedisLock(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisEnabled()) return;
  await redis.del(key);
}
