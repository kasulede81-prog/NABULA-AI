import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import {
  projectPlatformService,
  PlatformError,
} from "../services/platform/project-platform.service";
import { deploymentService } from "../services/platform/deployment.service";
import { projectService, ProjectError } from "../services/project.service";
import { workspaceService } from "../services/collaboration/workspace.service";

function handleError(err: unknown, reply: import("fastify").FastifyReply) {
  if (err instanceof PlatformError || err instanceof ProjectError) {
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

const envVarSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string(),
  environment: z.enum(["production", "preview", "development"]).default("production"),
});

const domainSchema = z.object({
  host: z.string().min(3).max(253),
});

const noteSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500),
  content: z.string().max(50_000),
  tags: z.array(z.string()).optional(),
});

const recordingSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500),
  durationSeconds: z.number().int().min(0).optional(),
  transcript: z.string().max(100_000).optional(),
});

const deploySchema = z.object({
  target: z.enum(["vercel", "netlify", "mock"]).default("mock"),
  commitMessage: z.string().max(500).optional(),
});

export async function platformRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Env vars
  app.get("/projects/:projectId/env-vars", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    try {
      const data = await projectPlatformService.listEnvVars(userId, projectId);
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/env-vars", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = envVarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await projectPlatformService.createEnvVar(
        userId,
        projectId,
        parsed.data
      );
      return reply.status(201).send({ data });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete("/projects/:projectId/env-vars/:envVarId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId, envVarId } = request.params as {
      projectId: string;
      envVarId: string;
    };
    try {
      await projectPlatformService.deleteEnvVar(userId, projectId, envVarId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Domains
  app.get("/projects/:projectId/domains", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    try {
      const data = await projectPlatformService.listDomains(userId, projectId);
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/domains", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = domainSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await projectPlatformService.addDomain(
        userId,
        projectId,
        parsed.data.host
      );
      return reply.status(201).send({ data });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete("/projects/:projectId/domains/:domainId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId, domainId } = request.params as {
      projectId: string;
      domainId: string;
    };
    try {
      await projectPlatformService.removeDomain(userId, projectId, domainId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/domains/:domainId/verify", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId, domainId } = request.params as {
      projectId: string;
      domainId: string;
    };
    try {
      const data = await projectPlatformService.verifyDomain(
        userId,
        projectId,
        domainId
      );
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Database tab — notes & recordings
  app.get("/projects/:projectId/notes", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const query = request.query as { q?: string; page?: string };
    try {
      const data = await projectPlatformService.listNotes(userId, projectId, {
        q: query.q,
        page: query.page ? parseInt(query.page, 10) : 0,
      });
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/notes", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = noteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await projectPlatformService.upsertNote(
        userId,
        projectId,
        parsed.data
      );
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete("/projects/:projectId/notes/:noteId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId, noteId } = request.params as {
      projectId: string;
      noteId: string;
    };
    try {
      await projectPlatformService.deleteNote(userId, projectId, noteId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/projects/:projectId/recordings", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const query = request.query as { q?: string; page?: string };
    try {
      const data = await projectPlatformService.listRecordings(userId, projectId, {
        q: query.q,
        page: query.page ? parseInt(query.page, 10) : 0,
      });
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/recordings", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = recordingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const data = await projectPlatformService.upsertRecording(
        userId,
        projectId,
        parsed.data
      );
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete(
    "/projects/:projectId/recordings/:recordingId",
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId, recordingId } = request.params as {
        projectId: string;
        recordingId: string;
      };
      try {
        await projectPlatformService.deleteRecording(
          userId,
          projectId,
          recordingId
        );
        return reply.status(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // Deployments
  app.get("/projects/:projectId/deployments", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    try {
      await projectService.get(projectId, userId);
      const data = await deploymentService.list(projectId);
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/projects/:projectId/deployments", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    const parsed = deploySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      await projectService.get(projectId, userId);
      const data = await deploymentService.create(projectId, userId, parsed.data);
      return reply.status(202).send({ data: { deploymentId: data.id } });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/projects/:projectId/deployments/:deploymentId", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId, deploymentId } = request.params as {
      projectId: string;
      deploymentId: string;
    };
    try {
      await projectService.get(projectId, userId);
      const data = await deploymentService.get(deploymentId, projectId);
      if (!data) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Deployment not found" },
        });
      }
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Aggregated logs
  app.get("/projects/:projectId/platform-logs", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    try {
      await projectService.get(projectId, userId);
      const data = await deploymentService.aggregateLogs(projectId);
      return { data };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Team context for project workspace tab
  app.get("/projects/:projectId/team", async (request, reply) => {
    const { userId } = request as AuthenticatedRequest;
    const { projectId } = request.params as { projectId: string };
    try {
      const project = await projectService.get(projectId, userId);
      if (!project.workspaceId) {
        return {
          data: {
            workspace: null,
            members: [],
            invitations: [],
            canManage: true,
          },
        };
      }
      const workspace = await workspaceService.get(project.workspaceId, userId);
      return { data: workspace };
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
