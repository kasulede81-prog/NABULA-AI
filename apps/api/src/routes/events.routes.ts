import type { FastifyInstance } from "fastify";
import { SseEvents } from "@nebula/shared";
import { eventService } from "../services/event.service";
import { projectService, ProjectError } from "../services/project.service";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";

export async function eventRoutes(app: FastifyInstance) {
  app.get(
    "/projects/:projectId/events",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      try {
        await projectService.get(projectId, userId);
      } catch (err) {
        if (err instanceof ProjectError) {
          return reply.status(err.status).send({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }

      reply.hijack();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (type: string, data: unknown) => {
        if (reply.raw.writableEnded) return;
        const payload = JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString(),
        });
        reply.raw.write(`event: ${type}\ndata: ${payload}\n\n`);
      };

      send(SseEvents.CONNECTED, { projectId });

      const heartbeat = setInterval(() => {
        if (reply.raw.writableEnded) return;
        reply.raw.write(": heartbeat\n\n");
      }, 15000);

      const unsubscribe = eventService.subscribe(projectId, (event) => {
        send(event.type, event.data);
      });

      await new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    }
  );
}
