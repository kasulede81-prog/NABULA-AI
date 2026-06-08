export const GITHUB_API = "https://api.github.com";
export const API_VERSION = "2022-11-28";

export class GithubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export interface GithubUser {
  id: number;
  login: string;
}

export interface GithubRepo {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
}

export interface GithubBlob {
  sha: string;
}

export interface GithubTree {
  sha: string;
}

export interface GithubCommit {
  sha: string;
}

export interface GithubRef {
  object: { sha: string };
}

export async function githubFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let message = `GitHub API error (${res.status})`;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      if (body) message = body.slice(0, 200);
    }
    throw new GithubError(
      "GITHUB_API_ERROR",
      message,
      res.status >= 500 ? 502 : 400
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  try {
    return await githubFetch<GithubUser>("/user", token);
  } catch (err) {
    if (err instanceof GithubError && err.status === 400) {
      throw new GithubError(
        "INVALID_TOKEN",
        "GitHub token is invalid or lacks required scopes",
        401
      );
    }
    throw err;
  }
}

export function sanitizeRepoName(slug: string): string {
  const base = slug
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);
  return base || "nebula-app";
}
