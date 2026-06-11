import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { projectService, ProjectError } from "../services/project.service";
import {
  previewTerminalService,
  PreviewTerminalError,
} from "../services/preview/preview-terminal.service";
import { authenticateWebSocket } from "../lib/ws-auth";

export async function terminalRoutes(app: FastifyInstance) {
  await app.register(websocket);

  app.get(
    "/projects/:projectId/preview/terminal",
    { websocket: true },
    async (socket, request) => {
      const auth = await authenticateWebSocket(request);
      if (!auth) {
        socket.close(4401, "Unauthorized");
        return;
      }

      const { projectId } = request.params as { projectId: string };

      try {
        await projectService.get(projectId, auth.userId);
      } catch (err) {
        socket.close(4403, err instanceof ProjectError ? err.message : "Forbidden");
        return;
      }

      let session: Awaited<
        ReturnType<typeof previewTerminalService.openSession>
      > | null = null;

      try {
        session = await previewTerminalService.openSession(
          projectId,
          auth.userId,
          {
            cols: 80,
            rows: 24,
            onData: (data) => {
              if (socket.readyState === socket.OPEN) {
                socket.send(JSON.stringify({ type: "output", data }));
              }
            },
          }
        );

        socket.send(JSON.stringify({ type: "ready", pid: session.pid }));
      } catch (err) {
        const msg =
          err instanceof PreviewTerminalError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Terminal failed";
        socket.send(JSON.stringify({ type: "error", message: msg }));
        socket.close(1011, msg);
        return;
      }

      socket.on("message", async (raw: Buffer | string) => {
        if (!session) return;
        try {
          const msg = JSON.parse(String(raw)) as {
            type?: string;
            data?: string;
            cols?: number;
            rows?: number;
          };

          if (msg.type === "stdin" && typeof msg.data === "string") {
            await session.sendInput(msg.data);
          } else if (
            msg.type === "resize" &&
            typeof msg.cols === "number" &&
            typeof msg.rows === "number"
          ) {
            await session.resize(msg.cols, msg.rows);
          }
        } catch {
          /* ignore malformed messages */
        }
      });

      socket.on("close", () => {
        void session?.disconnect().catch(() => undefined);
      });
    }
  );
}
