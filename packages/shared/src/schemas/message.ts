import { z } from "zod";
import { llmProviderSchema } from "./llm";

export const createMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  llmProvider: llmProviderSchema.optional(),
  attachedFiles: z.array(z.string().min(1).max(500)).max(20).optional(),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
