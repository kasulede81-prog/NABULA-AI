import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  stripeBillingService,
  StripeBillingError,
} from "../services/billing/stripe.service";

type WebhookRequest = FastifyRequest & { rawBody?: Buffer };

export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as WebhookRequest).rawBody = body as Buffer;
      try {
        const json = JSON.parse((body as Buffer).toString("utf8"));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.post("/webhooks/stripe", async (request, reply) => {
    const rawBody = (request as WebhookRequest).rawBody;
    if (!rawBody) {
      return reply.status(400).send({
        error: { code: "INVALID_BODY", message: "Missing raw body" },
      });
    }

    const signature = request.headers["stripe-signature"] as string | undefined;

    try {
      const result = await stripeBillingService.handleWebhook(
        rawBody,
        signature
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof StripeBillingError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
