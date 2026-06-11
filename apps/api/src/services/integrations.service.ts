import { env } from "../config/env";
import { isLLMProviderConfigured } from "../config/llm-provider";
import { emailService } from "./email.service";
import { sentryService } from "./observability/sentry.service";
import { vercelDeployService } from "./platform/vercel-deploy.service";
import { netlifyDeployService } from "./platform/netlify-deploy.service";
import { previewService } from "./preview.service";
import { stripeBillingService } from "./billing/stripe.service";
import { isRedisEnabled } from "../lib/redis";
import { webSearchService } from "./web-search.service";

export class IntegrationsService {
  getPublicConfig() {
    return {
      auth: {
        googleOAuth: env.SUPABASE_AUTH_GOOGLE_ENABLED === "true",
        githubOAuth: env.SUPABASE_AUTH_GITHUB_ENABLED === "true",
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      },
      llm: {
        defaultProvider: env.LLM_PROVIDER,
        providers: {
          anthropic: !!env.ANTHROPIC_API_KEY,
          deepseek: !!env.DEEPSEEK_API_KEY,
          openai: !!env.OPENAI_API_KEY,
          gemini: !!env.GEMINI_API_KEY,
        },
      },
      preview: {
        e2b: !!env.E2B_API_KEY,
        autoPreview: env.AUTO_PREVIEW_ENABLED,
      },
      deploy: {
        vercel: vercelDeployService.isConfigured(),
        netlify: netlifyDeployService.isConfigured(),
      },
      github: {
        oauth: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      },
      billing: {
        stripe: stripeBillingService.isConfigured(),
      },
      observability: {
        sentry: sentryService.isConfigured(),
        posthog: !!env.POSTHOG_API_KEY,
      },
      email: {
        resend: emailService.isConfigured(),
      },
      infra: {
        redis: isRedisEnabled(),
        fileStorageBackend: env.FILE_STORAGE_BACKEND,
        supabaseStorage:
          env.FILE_STORAGE_BACKEND === "supabase" &&
          !!env.SUPABASE_SERVICE_ROLE_KEY,
      },
      agents: {
        reviewer: env.REVIEWER_AGENT_ENABLED,
        bugbot: env.BUGBOT_ENABLED,
        tabAutocomplete: env.TAB_AUTOCOMPLETE_ENABLED,
        webSearch: webSearchService.isConfigured(),
      },
    };
  }

  getConfiguredLlmProviders() {
    const ids = ["anthropic", "deepseek", "openai", "gemini"] as const;
    return ids.filter((id) => isLLMProviderConfigured(id));
  }
}

export const integrationsService = new IntegrationsService();
