import { z } from "zod";
import { llmProviderSchema } from "./llm";

export const chatModeSchema = z.enum(["ask", "agent", "composer"]);

export const messageImageSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** Base64-encoded image data (no data URI prefix). ~2 MB max. */
  data: z.string().min(1).max(2_800_000),
});

export const createMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  llmProvider: llmProviderSchema.optional(),
  attachedFiles: z.array(z.string().min(1).max(500)).max(20).optional(),
  chatMode: chatModeSchema.optional().default("agent"),
  images: z.array(messageImageSchema).max(3).optional(),
});

export type MessageImageInput = z.infer<typeof messageImageSchema>;

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
