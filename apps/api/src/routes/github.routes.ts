import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { githubService, GithubError } from "../services/github.service";

const connectSchema = z.object({
  token: z.string().min(1, "GitHub token is required"),
});

export async function githubRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/github/connection", async (request) => {
    const { userId } = request as AuthenticatedRequest;
    const connection = await githubService.getConnection(userId);
    return {
      data: connection
        ? { connected: true, username: connection.username, connectedAt: connection.connectedAt }
        : { connected: false },
    };
  });

  app.put("/github/connection", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const parsed = connectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const result = await githubService.connect(userId, parsed.data.token);
      return { data: { connected: true, username: result.username } };
    } catch (err) {
      if (err instanceof GithubError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.delete("/github/connection", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    await githubService.disconnect(userId);
    return reply.status(204).send();
  });

  app.get("/projects/:projectId/github/export", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const exportInfo = await githubService.getExport(projectId, userId);
      return { data: exportInfo };
    } catch (err) {
      if (err instanceof GithubError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/github/export", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const result = await githubService.exportProject(projectId, userId);
      return reply.status(201).send({ data: result });
    } catch (err) {
      if (err instanceof GithubError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
