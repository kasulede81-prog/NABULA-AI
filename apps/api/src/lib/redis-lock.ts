import { randomUUID } from "node:crypto";
import { getRedis, isRedisEnabled } from "./redis";

// Tokens for locks held by this process — release verifies ownership so a
// slow holder can't delete a lock that already expired and was re-acquired.
const heldTokens = new Map<string, string>();

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export async function acquireRedisLock(
  key: string,
  ttlSec = 3600
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isRedisEnabled()) return true;
  const token = randomUUID();
  const result = await redis.set(key, token, "EX", ttlSec, "NX");
  if (result === "OK") {
    heldTokens.set(key, token);
    return true;
  }
  return false;
}

export async function releaseRedisLock(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisEnabled()) return;
  const token = heldTokens.get(key);
  heldTokens.delete(key);
  if (!token) {
    return;
  }
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}
