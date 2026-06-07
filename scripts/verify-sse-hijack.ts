/**
 * Isolated Fastify SSE hijack lifecycle test (no database).
 */
import Fastify from "fastify";

const PORT = 3999;

async function main() {
  const app = Fastify({ logger: false });

  app.get("/sse", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    reply.raw.write(
      'event: connected\ndata: {"type":"connected","data":{},"timestamp":"t"}\n\n'
    );

    const timer = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(": heartbeat\n\n");
      }
    }, 200);

    await new Promise<void>((resolve) => {
      request.raw.on("close", () => {
        clearInterval(timer);
        resolve();
      });
    });
  });

  await app.listen({ port: PORT, host: "127.0.0.1" });

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 1500);

  const res = await fetch(`http://127.0.0.1:${PORT}/sse`, {
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let chunk = "";
  const { value } = await reader.read();
  chunk = decoder.decode(value);

  await app.close();

  const hasConnected = chunk.includes("event: connected");
  const hasData = chunk.includes("data:");

  if (!hasConnected || !hasData) {
    console.error("FAIL: SSE hijack — no connected event in stream");
    console.error("Received:", chunk);
    process.exit(1);
  }

  console.log("PASS: SSE hijack — connected event received, connection held until abort");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
