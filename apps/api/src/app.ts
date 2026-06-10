import Fastify from "fastify";
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
import { errorMonitorService } from "./services/stability/error-monitor.service";
import { registerRequestTiming } from "./middleware/request-timing";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await registerRequestTiming(app);

  await app.register(cors, {
    origin: env.WEB_URL,
    credentials: true,
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes);
      await v1.register(projectRoutes);
      await v1.register(messageRoutes);
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
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  return app;
}
