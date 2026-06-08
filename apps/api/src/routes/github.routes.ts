import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { verifyToken } from "../lib/jwt";
import { env } from "../config/env";
import { githubService, GithubError } from "../services/github.service";
import { requireQuota, consumeQuota } from "../middleware/quota";
import { QuotaExceededError } from "../services/billing/billing.service";
import { rateLimitByUser } from "../middleware/rate-limit";
import { captureRouteError } from "../services/stability/error-capture";
import { githubTrackingService } from "../services/collaboration/github-tracking.service";

const connectSchema = z.object({
  token: z.string().min(1, "GitHub token is required"),
});

function resolveUserId(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      return verifyToken(authHeader.slice(7)).userId;
    } catch {
      return null;
    }
  }
  const query = request.query as { token?: string };
  if (query.token) {
    try {
      return verifyToken(query.token).userId;
    } catch {
      return null;
    }
  }
  return null;
}

function apiBaseFromRequest(request: FastifyRequest): string {
  const proto = (request.headers["x-forwarded-proto"] as string) ?? "http";
  const host = request.headers.host ?? `localhost:${env.API_PORT}`;
  return `${proto}://${host}`;
}

function handleGithubError(
  err: unknown,
  reply: import("fastify").FastifyReply,
  context?: { userId?: string; projectId?: string }
) {
  if (err instanceof GithubError) {
    captureRouteError("github", err, {
      userId: context?.userId,
      projectId: context?.projectId,
      code: err.code,
    });
    return reply.status(err.status).send({
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}

export async function githubRoutes(app: FastifyInstance) {
  /** OAuth callback — no auth header; state carries userId. */
  app.get("/github/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (query.error) {
      return reply.redirect(
        `${env.WEB_URL}/projects?github=error&message=${encodeURIComponent(query.error)}`
      );
    }

    if (!query.code || !query.state) {
      return reply.redirect(
        `${env.WEB_URL}/projects?github=error&message=${encodeURIComponent("Missing OAuth parameters")}`
      );
    }

    try {
      const { userId, redirectUri } = githubService.verifyOAuthState(query.state);
      const accessToken = await githubService.exchangeOAuthCode(
        query.code,
        redirectUri
      );
      await githubService.connectOAuth(userId, accessToken);
      return reply.redirect(`${env.WEB_URL}/projects?github=connected`);
    } catch (err) {
      const message =
        err instanceof GithubError ? err.message : "GitHub connection failed";
      return reply.redirect(
        `${env.WEB_URL}/projects?github=error&message=${encodeURIComponent(message)}`
      );
    }
  });

  /** Start OAuth — accepts Bearer token or ?token= for browser redirect. */
  app.get("/github/connect", async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    try {
      const url = githubService.buildAuthorizeUrl(userId, apiBaseFromRequest(request));
      return reply.redirect(url);
    } catch (err) {
      return handleGithubError(err, reply);
    }
  });

  app.register(async (authed) => {
    authed.addHook("preHandler", authenticate);

    authed.get("/github/status", async (request) => {
      const { userId } = request as AuthenticatedRequest;
      const data = await githubService.getStatus(userId);
      return { data };
    });

    authed.post("/github/disconnect", async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      await githubService.disconnect(userId);
      return reply.status(204).send();
    });

    // Legacy PAT connection endpoints
    authed.get("/github/connection", async (request) => {
      const { userId } = request as AuthenticatedRequest;
      const status = await githubService.getStatus(userId);
      return {
        data: status.connected
          ? {
              connected: true,
              username: status.username,
              connectedAt: status.connectedAt,
              tokenType: status.tokenType,
            }
          : { connected: false, oauthConfigured: status.oauthConfigured },
      };
    });

    authed.put("/github/connection", async (request, reply) => {
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
        return handleGithubError(err, reply);
      }
    });

    authed.delete("/github/connection", async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      await githubService.disconnect(userId);
      return reply.status(204).send();
    });

    authed.get("/projects/:projectId/github/status", async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      try {
        const [connection, repository, sync] = await Promise.all([
          githubService.getStatus(userId),
          githubService.getProjectRepository(projectId, userId),
          githubService.getSyncStatus(projectId, userId),
        ]);

        return {
          data: {
            connected: connection.connected,
            username: connection.username,
            oauthConfigured: connection.oauthConfigured,
            repository,
            syncAvailable: sync.syncAvailable,
            changedFileCount: sync.changedFileCount,
          },
        };
      } catch (err) {
        return handleGithubError(err, reply);
      }
    });

    authed.post(
      "/projects/:projectId/github/create",
      {
        preHandler: [rateLimitByUser("github"), requireQuota("github_export")],
      },
      async (request, reply) => {
        const { userId } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };

        try {
          await consumeQuota(userId, "github_export", projectId);
          const result = await githubService.createRepository(projectId, userId);
          await githubTrackingService.recordCreated(projectId, userId);
          return reply.status(201).send({ data: result });
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            return reply.status(err.status).send({
              error: { code: err.code, message: err.message },
            });
          }
          return handleGithubError(err, reply, { userId, projectId });
        }
      }
    );

    authed.post("/projects/:projectId/github/sync", async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      try {
        const result = await githubService.syncRepository(projectId, userId);
        await githubTrackingService.recordSynced(projectId, userId);
        return { data: result };
      } catch (err) {
        return handleGithubError(err, reply, { userId, projectId });
      }
    });

    // Legacy export endpoints
    authed.get("/projects/:projectId/github/export", async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      try {
        const exportInfo = await githubService.getExport(projectId, userId);
        return { data: exportInfo };
      } catch (err) {
        return handleGithubError(err, reply);
      }
    });

    authed.post(
      "/projects/:projectId/github/export",
      {
        preHandler: [rateLimitByUser("github"), requireQuota("github_export")],
      },
      async (request, reply) => {
        const { userId } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };

        try {
          await consumeQuota(userId, "github_export", projectId);
          const result = await githubService.exportProject(projectId, userId);
          await githubTrackingService.recordCreated(projectId, userId);
          return reply.status(201).send({ data: result });
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            return reply.status(err.status).send({
              error: { code: err.code, message: err.message },
            });
          }
          return handleGithubError(err, reply, { userId, projectId });
        }
      }
    );
  });
}
