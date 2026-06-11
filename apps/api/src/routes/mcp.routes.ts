import type { FastifyInstance } from "fastify";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import {
  mcpBridgeService,
  updateMcpConfigSchema,
} from "../services/mcp-bridge.service";
import { projectService, ProjectError } from "../services/project.service";

export async function mcpRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/projects/:projectId/mcp", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };

    try {
      const data = await mcpBridgeService.getConfig(projectId, userId);
      return reply.send({ data });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.put("/projects/:projectId/mcp", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = updateMcpConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }

    try {
      const data = await mcpBridgeService.updateConfig(
        projectId,
        userId,
        parsed.data
      );
      return reply.send({ data });
    } catch (err) {
      if (err instanceof ProjectError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  app.post("/projects/:projectId/mcp", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      jsonrpc?: string;
      id?: string | number | null;
      method: string;
      params?: Record<string, unknown>;
    };

    if (!body?.method) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "JSON-RPC method required" },
      });
    }

    try {
      const result = await mcpBridgeService.handleRpc(projectId, userId, body);
      return reply.send(result);
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
