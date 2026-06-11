import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { env } from "./config/env";
import { healthRoutes } from "./routes/health.routes";
import { authRoutes } from "./routes/auth.routes";
import { projectRoutes } from "./routes/projects.routes";
import { messageRoutes } from "./routes/messages.routes";
import { fileRoutes } from "./routes/files.routes";
import { eventRoutes } from "./routes/events.routes";
import { buildRoutes } from "./routes/build.routes";
import { previewRoutes } from "./routes/preview.routes";
import { githubRoutes } from "./routes/github.routes";
import { billingRoutes } from "./routes/billing.routes";
import { supportRoutes } from "./routes/support.routes";
import { stabilityRoutes } from "./routes/stability.routes";
import { workspaceRoutes } from "./routes/workspace.routes";
import { adminRoutes } from "./routes/admin.routes";
import { platformRoutes } from "./routes/platform.routes";
import { llmRoutes } from "./routes/llm.routes";
import { agentRunRoutes } from "./routes/agent-runs.routes";
import { changesetRoutes } from "./routes/changeset.routes";
import { codebaseRoutes } from "./routes/codebase.routes";
import { terminalRoutes } from "./routes/terminal.routes";
import { mcpRoutes } from "./routes/mcp.routes";
import { agentQueueRoutes } from "./routes/agent-queue.routes";
import { notificationRoutes } from "./routes/notification.routes";
import { aiAssistRoutes } from "./routes/ai-assist.routes";
import { integrationsRoutes } from "./routes/integrations.routes";
import { stripeWebhookRoutes } from "./routes/stripe-webhook.routes";
import { errorMonitorService } from "./services/stability/error-monitor.service";
import { sentryService } from "./services/observability/sentry.service";
import { registerRequestTiming } from "./middleware/request-timing";
import { registerGlobalRateLimit } from "./middleware/global-rate-limit";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    // Sized for chat image attachments (3 × ~2.8 MB base64) plus payload.
    bodyLimit: 12 * 1024 * 1024,
  });

  await registerRequestTiming(app);
  await registerGlobalRateLimit(app);

  await app.register(cookie);

  await app.register(cors, {
    origin: env.WEB_URL,
    credentials: true,
  });

  await app.register(stripeWebhookRoutes, { prefix: "/v1" });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(integrationsRoutes);
      await v1.register(authRoutes);
      await v1.register(projectRoutes);
      await v1.register(messageRoutes);
      await v1.register(codebaseRoutes);
      await v1.register(fileRoutes);
      await v1.register(eventRoutes);
      await v1.register(buildRoutes);
      await v1.register(previewRoutes);
      await v1.register(githubRoutes);
      await v1.register(billingRoutes);
      await v1.register(supportRoutes);
      await v1.register(stabilityRoutes);
      await v1.register(workspaceRoutes);
      await v1.register(platformRoutes);
      await v1.register(adminRoutes);
      await v1.register(llmRoutes);
      await v1.register(agentRunRoutes);
      await v1.register(changesetRoutes);
      await v1.register(terminalRoutes);
      await v1.register(mcpRoutes);
      await v1.register(agentQueueRoutes);
      await v1.register(notificationRoutes);
      await v1.register(aiAssistRoutes);
    },
    { prefix: "/v1" }
  );

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    void errorMonitorService
      .captureFromUnknown("api", error, {
        code: "INTERNAL_ERROR",
        userId: (request as { userId?: string }).userId,
      })
      .catch(() => undefined);
    void sentryService
      .captureException(error, {
        route: request.url,
        userId: (request as { userId?: string }).userId,
      })
      .catch(() => undefined);
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  return app;
}
