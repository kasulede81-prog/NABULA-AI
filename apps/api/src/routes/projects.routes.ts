import type { FastifyInstance } from "fastify";
import { createProjectSchema, updateProjectSchema } from "@nebula/shared";
import { projectService, ProjectError } from "../services/project.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireQuota, consumeQuota } from "../middleware/quota";
import { QuotaExceededError } from "../services/billing/billing.service";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const projects = await projectService.list(userId);
    return { data: projects };
  });

  app.post(
    "/projects",
    { preHandler: requireQuota("project_creation") },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        });
      }

      const project = await projectService.create(userId, parsed.data);

      try {
        await consumeQuota(userId, "project_created", project.id);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return reply.status(err.status).send({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }

      return reply.status(201).send(project);
    }
  );

  app.get("/projects/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    try {
      const project = await projectService.get(id, userId);
      return reply.send(project);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.patch("/projects/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const project = await projectService.update(id, userId, parsed.data);
      return reply.send(project);
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    try {
      await projectService.delete(id, userId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
