import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import {
  workspaceService,
  WorkspaceError,
} from "../services/collaboration/workspace.service";
import {
  workspaceMemberService,
} from "../services/collaboration/workspace-member.service";
import {
  WorkspaceAccessError,
} from "../services/collaboration/workspace-access.service";

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

const acceptSchema = z.object({
  token: z.string().min(1),
});

const roleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

const transferSchema = z.object({
  newOwnerUserId: z.string().uuid(),
});

function handleWorkspaceError(
  err: unknown,
  reply: import("fastify").FastifyReply
) {
  if (err instanceof WorkspaceError || err instanceof WorkspaceAccessError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

export async function workspaceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/workspaces", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const data = await workspaceService.create(userId, parsed.data.name);
      return reply.status(201).send({ data });
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.get("/workspaces", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    try {
      const data = await workspaceService.listForUser(userId);
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.get("/workspaces/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    try {
      const data = await workspaceService.get(id, userId);
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.patch("/workspaces/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const parsed = renameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await workspaceService.rename(id, userId, parsed.data.name);
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.delete("/workspaces/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    try {
      await workspaceService.delete(id, userId);
      return reply.status(204).send();
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.post("/workspaces/:id/transfer", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await workspaceService.transferOwnership(
        id,
        userId,
        parsed.data.newOwnerUserId
      );
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.post("/workspaces/:id/invite", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await workspaceMemberService.invite(
        id,
        userId,
        parsed.data.email,
        parsed.data.role
      );
      return reply.status(201).send({ data });
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.post("/workspaces/:id/accept", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const parsed = acceptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await workspaceMemberService.accept(id, userId, parsed.data.token);
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.patch("/workspaces/:id/members/:memberId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id, memberId } = request.params as { id: string; memberId: string };
    const parsed = roleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await workspaceMemberService.updateRole(
        id,
        userId,
        memberId,
        parsed.data.role
      );
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });

  app.delete("/workspaces/:id/members/:memberId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id, memberId } = request.params as { id: string; memberId: string };
    try {
      const data = await workspaceMemberService.remove(id, userId, memberId);
      return { data };
    } catch (err) {
      return handleWorkspaceError(err, reply);
    }
  });
}
