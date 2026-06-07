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
import { adminRoutes } from "./routes/admin.routes";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024,
  });

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
      await v1.register(adminRoutes);
    },
    { prefix: "/v1" }
  );

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  return app;
}
