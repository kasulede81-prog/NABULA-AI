import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { encryptSecret, decryptSecret } from "../../lib/token-crypto";
import { env } from "../../config/env";
import { fetchGithubUser, GithubError } from "./github-api";
import { githubAuditService } from "./github-audit.service";

const OAUTH_SCOPES = ["repo", "read:user"].join(" ");
const STATE_PURPOSE = "github_oauth";

interface OAuthState {
  userId: string;
  purpose: string;
  redirectUri: string;
}

export class GithubAuthService {
  isOAuthConfigured(): boolean {
    return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  }

  getApiCallbackUrl(apiBase: string): string {
    return (
      env.GITHUB_OAUTH_CALLBACK_URL ??
      `${apiBase.replace(/\/$/, "")}/v1/github/callback`
    );
  }

  buildAuthorizeUrl(userId: string, apiBase: string): string {
    if (!this.isOAuthConfigured()) {
      throw new GithubError(
        "OAUTH_NOT_CONFIGURED",
        "GitHub OAuth is not configured on this server",
        503
      );
    }

    const redirectUri = this.getApiCallbackUrl(apiBase);
    const state = jwt.sign(
      { userId, purpose: STATE_PURPOSE, redirectUri },
      env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPES,
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  verifyState(state: string): { userId: string; redirectUri: string } {
    try {
      const payload = jwt.verify(state, env.JWT_SECRET) as OAuthState;
      if (
        payload.purpose !== STATE_PURPOSE ||
        !payload.userId ||
        !payload.redirectUri
      ) {
        throw new GithubError("INVALID_STATE", "Invalid OAuth state", 400);
      }
      return { userId: payload.userId, redirectUri: payload.redirectUri };
    } catch (err) {
      if (err instanceof GithubError) throw err;
      throw new GithubError("INVALID_STATE", "OAuth state expired or invalid", 400);
    }
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
    if (!this.isOAuthConfigured()) {
      throw new GithubError("OAUTH_NOT_CONFIGURED", "GitHub OAuth not configured", 503);
    }

    const body = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new GithubError("OAUTH_EXCHANGE_FAILED", "Failed to exchange OAuth code", 502);
    }

    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!data.access_token) {
      throw new GithubError(
        "OAUTH_EXCHANGE_FAILED",
        data.error_description ?? data.error ?? "No access token returned",
        400
      );
    }

    return data.access_token;
  }

  async connectWithOAuth(userId: string, accessToken: string) {
    const user = await fetchGithubUser(accessToken);

    await prisma.githubConnection.upsert({
      where: { userId },
      create: {
        userId,
        githubUserId: String(user.id),
        username: user.login,
        encryptedAccessToken: encryptSecret(accessToken),
        tokenType: "oauth",
      },
      update: {
        githubUserId: String(user.id),
        username: user.login,
        encryptedAccessToken: encryptSecret(accessToken),
        tokenType: "oauth",
      },
    });

    await githubAuditService.log({
      userId,
      action: "github_connected",
      metadata: { method: "oauth", username: user.login },
    });

    return { username: user.login };
  }

  async connectWithPat(userId: string, token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new GithubError("INVALID_TOKEN", "GitHub token is required", 400);
    }

    const user = await fetchGithubUser(trimmed);

    await prisma.githubConnection.upsert({
      where: { userId },
      create: {
        userId,
        githubUserId: String(user.id),
        username: user.login,
        encryptedAccessToken: encryptSecret(trimmed),
        tokenType: "pat",
      },
      update: {
        githubUserId: String(user.id),
        username: user.login,
        encryptedAccessToken: encryptSecret(trimmed),
        tokenType: "pat",
      },
    });

    await githubAuditService.log({
      userId,
      action: "github_connected",
      metadata: { method: "pat", username: user.login },
    });

    return { username: user.login };
  }

  async disconnect(userId: string) {
    await prisma.githubConnection.deleteMany({ where: { userId } });
    await githubAuditService.log({ userId, action: "github_disconnected" });
  }

  async getStatus(userId: string) {
    const row = await prisma.githubConnection.findUnique({ where: { userId } });
    return {
      oauthConfigured: this.isOAuthConfigured(),
      connected: Boolean(row),
      username: row?.username ?? null,
      tokenType: row?.tokenType ?? null,
      connectedAt: row?.createdAt.toISOString() ?? null,
    };
  }

  async getConnection(userId: string) {
    const row = await prisma.githubConnection.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      githubUserId: row.githubUserId,
      tokenType: row.tokenType,
      connectedAt: row.createdAt.toISOString(),
    };
  }

  async getDecryptedToken(userId: string): Promise<{
    token: string;
    connection: { id: string; username: string };
  }> {
    const connection = await prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      throw new GithubError(
        "GITHUB_NOT_CONNECTED",
        "Connect your GitHub account first",
        401
      );
    }

    const token = decryptSecret(connection.encryptedAccessToken);
    const valid = await this.validateToken(token);
    if (!valid) {
      throw new GithubError(
        "GITHUB_TOKEN_EXPIRED",
        "GitHub token is invalid or expired — reconnect your account",
        401
      );
    }

    return {
      token,
      connection: { id: connection.id, username: connection.username },
    };
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      await fetchGithubUser(token);
      return true;
    } catch {
      return false;
    }
  }
}

export const githubAuthService = new GithubAuthService();
