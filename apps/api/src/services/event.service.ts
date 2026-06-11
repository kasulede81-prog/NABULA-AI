import { EventEmitter } from "events";
import type { SseEvent, SseEventType } from "@nebula/shared";
import {
  connectRedis,
  getRedis,
  getRedisSubscriber,
  isRedisEnabled,
  RedisChannels,
} from "../lib/redis";

type ProjectListener = (event: SseEvent) => void;

class EventService {
  private emitters = new Map<string, EventEmitter>();
  private redisReady = false;

  async init() {
    if (!isRedisEnabled() || this.redisReady) return;
    await connectRedis();
    const sub = getRedisSubscriber();
    if (!sub) return;

    await sub.psubscribe("nebula:events:*");
    sub.on("pmessage", (_pattern, channel, message) => {
      try {
        const event = JSON.parse(message) as SseEvent;
        const projectId = channel.replace("nebula:events:", "");
        this.getEmitter(projectId).emit("event", event);
      } catch {
        /* ignore malformed */
      }
    });
    this.redisReady = true;
  }

  private getEmitter(projectId: string): EventEmitter {
    let emitter = this.emitters.get(projectId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      this.emitters.set(projectId, emitter);
    }
    return emitter;
  }

  publish<T extends Record<string, unknown>>(
    projectId: string,
    type: SseEventType,
    data: T
  ): void {
    const event: SseEvent<T> = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    this.getEmitter(projectId).emit("event", event);

    const redis = getRedis();
    if (redis) {
      void redis
        .publish(RedisChannels.events(projectId), JSON.stringify(event))
        .catch(() => undefined);
    }
  }

  subscribe(projectId: string, listener: ProjectListener): () => void {
    const emitter = this.getEmitter(projectId);
    emitter.on("event", listener);
    return () => emitter.off("event", listener);
  }

  unsubscribeAll(projectId: string): void {
    const emitter = this.emitters.get(projectId);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(projectId);
    }
  }
}

export const eventService = new EventService();
