import type { FastifyReply, FastifyRequest } from "fastify";
import type { UsageEventType } from "@nebula/database";
import type { AuthenticatedRequest } from "./auth";
import {
  billingService,
  QuotaExceededError,
} from "../services/billing/billing.service";
import { billingAuditService } from "../services/billing/billing-audit.service";

type QuotaCheck =
  | "project_creation"
  | "ai_request"
  | "builder_run"
  | "preview_launch"
  | "github_export";

const CHECK_MAP: Record<
  QuotaCheck,
  (userId: string) => Promise<void>
> = {
  project_creation: (id) => billingService.assertProjectCreation(id),
  ai_request: (id) => billingService.assertAiRequest(id),
  builder_run: (id) => billingService.assertBuilderRun(id),
  preview_launch: (id) => billingService.assertPreviewLaunch(id),
  github_export: (id) => billingService.assertGithubExport(id),
};

export function requireQuota(check: QuotaCheck) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request as AuthenticatedRequest;
    try {
      await CHECK_MAP[check](userId);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        await billingAuditService.log({
          userId,
          action: "quota_exceeded",
          message: err.message,
          metadata: {
            code: err.code,
            check,
            ...err.details,
          },
        });
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  };
}

export async function consumeQuota(
  userId: string,
  eventType: UsageEventType,
  projectId?: string
) {
  switch (eventType) {
    case "project_created":
      return billingService.consumeProjectCreation(userId, projectId!);
    case "ai_generation":
      return billingService.consumeAiRequest(userId, projectId!);
    case "builder_run":
      return billingService.consumeBuilderRun(userId, projectId!);
    case "preview_launch":
      return billingService.consumePreviewLaunch(userId, projectId!);
    case "github_export":
      return billingService.consumeGithubExport(userId, projectId!);
    default:
      return null;
  }
}
