import { env } from "../../config/env";
import { authService, AuthError } from "../auth.service";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/password";
import { billingService } from "../billing/billing.service";
import { PLAN_LIMITS } from "../billing/billing-plans";

interface SupabaseUserResponse {
  id?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
  error?: string;
  msg?: string;
}

export class SupabaseAuthService {
  isGoogleEnabled() {
    return env.SUPABASE_AUTH_GOOGLE_ENABLED === "true";
  }

  isGithubEnabled() {
    return env.SUPABASE_AUTH_GITHUB_ENABLED === "true";
  }

  isAnyOAuthEnabled() {
    return this.isGoogleEnabled() || this.isGithubEnabled();
  }

  async exchangeAccessToken(accessToken: string) {
    if (!this.isAnyOAuthEnabled()) {
      throw new AuthError(
        "OAUTH_NOT_CONFIGURED",
        "Supabase OAuth is not enabled",
        503
      );
    }

    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    });

    const data = (await res.json()) as SupabaseUserResponse;
    if (!res.ok || !data.email) {
      throw new AuthError(
        "OAUTH_INVALID",
        data.error ?? data.msg ?? "Invalid Supabase session",
        401
      );
    }

    const email = data.email.toLowerCase();
    const name =
      data.user_metadata?.full_name ??
      data.user_metadata?.name ??
      email.split("@")[0];

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const passwordHash = await hashPassword(
        `oauth-${data.id ?? email}-${Date.now()}`
      );
      const initialCredits = PLAN_LIMITS.free.monthlyCredits ?? 100;
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          subscription: {
            create: {
              plan: "free",
              buildsLimit: PLAN_LIMITS.free.dailyAiRequests ?? 20,
              creditsBalance: initialCredits,
              renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });
      await prisma.creditLedger.create({
        data: {
          userId: user.id,
          type: "monthly_grant",
          amount: initialCredits,
          balanceAfter: initialCredits,
          metadata: { reason: "oauth_signup" },
        },
      });
    }

    await billingService.getSnapshot(user.id);
    return authService.createSessionForUser(user.id);
  }
}

export const supabaseAuthService = new SupabaseAuthService();
