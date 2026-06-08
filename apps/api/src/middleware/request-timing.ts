import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    requestStartMs?: number;
  }
}

const SLOW_MS = 1000;

export async function registerRequestTiming(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    request.requestStartMs = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    const started = request.requestStartMs ?? Date.now();
    const durationMs = Date.now() - started;
    const route =
      request.routeOptions?.url ?? request.url.split("?")[0];

    const payload = {
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs,
    };

    if (durationMs >= SLOW_MS) {
      request.log.warn(payload, "slow request");
    } else {
      request.log.info(payload, "request completed");
    }
  });
}
