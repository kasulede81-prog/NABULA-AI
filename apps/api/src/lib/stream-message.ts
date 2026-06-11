import { randomUUID } from "crypto";
import { SseEvents } from "@nebula/shared";
import { eventService } from "../services/event.service";

export async function streamAssistantMessage(
  projectId: string,
  content: string,
  persist: (text: string) => Promise<{
    id: string;
    role: string;
    content: string;
    createdAt: Date | string;
  }>
) {
  const streamId = randomUUID();
  const words = content.split(/(\s+)/);
  let buffer = "";

  for (const part of words) {
    buffer += part;
    eventService.publish(projectId, SseEvents.MESSAGE_DELTA, {
      streamId,
      delta: part,
    });
    await new Promise((r) => setTimeout(r, 8));
  }

  const message = await persist(buffer.trim() || content);
  eventService.publish(projectId, SseEvents.MESSAGE_DELTA, {
    streamId,
    delta: "",
    done: true,
    messageId: message.id,
  });
  eventService.publish(projectId, SseEvents.MESSAGE_CREATED, {
    ...message,
    streamId,
  });
  return message;
}
