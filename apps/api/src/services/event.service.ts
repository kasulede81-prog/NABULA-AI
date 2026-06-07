import { EventEmitter } from "events";
import type { SseEvent, SseEventType } from "@nebula/shared";

type ProjectListener = (event: SseEvent) => void;

class EventService {
  private emitters = new Map<string, EventEmitter>();

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
