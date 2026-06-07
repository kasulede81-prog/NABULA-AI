import { z } from "zod";

export const appSpecSchema = z.object({
  appType: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  features: z.array(z.string()).min(1),
  stack: z.literal("nextjs-prisma-tailwind").default("nextjs-prisma-tailwind"),
  entities: z
    .array(
      z.object({
        name: z.string(),
        fields: z.array(z.string()),
      })
    )
    .optional(),
  pages: z.array(z.string()).optional(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
});

export const clarifierOutputSchema = z.object({
  ready: z.boolean(),
  questions: z.array(clarificationQuestionSchema).max(3),
  spec: appSpecSchema.nullable(),
});

export type AppSpec = z.infer<typeof appSpecSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
export type ClarifierOutput = z.infer<typeof clarifierOutputSchema>;
