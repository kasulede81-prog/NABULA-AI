import type { FastifyInstance } from "fastify";
import {
  isLLMProviderConfigured,
  type LLMProviderId,
} from "../config/llm-provider";
import { env } from "../config/env";
import { llmProviderLabels, type LlmProviderId } from "@nebula/shared";
import { authenticate } from "../middleware/auth";

const ALL_PROVIDERS: LlmProviderId[] = [
  "anthropic",
  "deepseek",
  "openai",
  "gemini",
];

export async function llmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/llm/providers", async () => {
    const providers = ALL_PROVIDERS.filter((id) =>
      isLLMProviderConfigured(id as LLMProviderId)
    ).map((id) => ({
      id,
      label: llmProviderLabels[id],
      default: id === env.LLM_PROVIDER,
    }));

    return {
      data: providers,
      defaultProvider: env.LLM_PROVIDER,
    };
  });

  app.get("/platform/deploy-targets", async () => {
    const targets: Array<{
      id: "vercel" | "netlify" | "mock";
      label: string;
      configured: boolean;
      default?: boolean;
    }> = [
      {
        id: "vercel",
        label: "Vercel",
        configured: !!env.VERCEL_TOKEN,
      },
      {
        id: "netlify",
        label: "Netlify",
        configured: !!env.NETLIFY_TOKEN,
      },
      {
        id: "mock",
        label: "Simulated",
        configured: true,
      },
    ];

    const defaultTarget = env.VERCEL_TOKEN
      ? "vercel"
      : env.NETLIFY_TOKEN
        ? "netlify"
        : "mock";

    return {
      data: targets.map((t) => ({ ...t, default: t.id === defaultTarget })),
      defaultTarget,
    };
  });
}
