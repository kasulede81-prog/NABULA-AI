import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  prompt: z.string().min(1).max(10000),
  workspaceId: z.string().uuid().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z
    .enum(["draft", "clarifying", "building", "ready", "failed"])
    .optional(),
  agentRules: z.string().max(20000).nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
