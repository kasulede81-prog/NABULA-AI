import { randomUUID } from "node:crypto";
import { env } from "../../config/env";

export class SentryService {
  isConfigured() {
    return Boolean(env.SENTRY_DSN?.trim());
  }

  async captureException(
    error: unknown,
    context?: Record<string, unknown>
  ): Promise<void> {
    if (!this.isConfigured()) return;

    const err = error instanceof Error ? error : new Error(String(error));
    const dsn = new URL(env.SENTRY_DSN);
    const projectId = dsn.pathname.replace("/", "");
    const endpoint = `${dsn.protocol}//${dsn.host}/api/${projectId}/store/`;

    const payload = {
      event_id: randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      exception: {
        values: [
          {
            type: err.name,
            value: err.message,
            stacktrace: { frames: parseStack(err.stack) },
          },
        ],
      },
      extra: context ?? {},
    };

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.username}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      /* ignore transport errors */
    }
  }
}

function parseStack(stack?: string) {
  if (!stack) return [];
  return stack
    .split("\n")
    .slice(1, 8)
    .map((line) => ({ filename: line.trim() }));
}

export const sentryService = new SentryService();
