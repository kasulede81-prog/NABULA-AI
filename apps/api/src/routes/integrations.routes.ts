import type { FastifyInstance } from "fastify";
import { integrationsService } from "../services/integrations.service";
import { supabaseAuthService } from "../services/auth/supabase-auth.service";
import { env } from "../config/env";

export async function integrationsRoutes(app: FastifyInstance) {
  app.get("/integrations", async () => {
    return { data: integrationsService.getPublicConfig() };
  });

  app.get("/auth/oauth/config", async () => {
    const redirectTo = `${env.WEB_URL}/auth/callback`;
    const base = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize`;
    const apikey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const buildUrl = (provider: string) =>
      supabaseAuthService.isAnyOAuthEnabled()
        ? `${base}?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&apikey=${encodeURIComponent(apikey)}`
        : null;

    return {
      data: {
        google: supabaseAuthService.isGoogleEnabled()
          ? buildUrl("google")
          : null,
        github: supabaseAuthService.isGithubEnabled()
          ? buildUrl("github")
          : null,
      },
    };
  });
}
