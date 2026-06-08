import type { Sandbox } from "e2b";

const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_POLL_MS = 2_000;

export interface HealthCheckResult {
  ok: boolean;
  port: number | null;
  attempts: number;
  lastStatus: number | null;
}

export async function waitForHealthyServer(
  sandbox: Sandbox,
  ports: number[],
  onAttempt?: (port: number, status: number | null) => void
): Promise<HealthCheckResult> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  let attempts = 0;
  let lastStatus: number | null = null;

  while (Date.now() < deadline) {
    for (const port of ports) {
      attempts += 1;
      const probe = await sandbox.commands.run(
        `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port} 2>/dev/null || echo "000"`,
        { timeoutMs: 10_000 }
      );
      const status = Number(probe.stdout.trim()) || null;
      lastStatus = status;
      onAttempt?.(port, status);

      if (status !== null && status >= 200 && status < 400) {
        return { ok: true, port, attempts, lastStatus: status };
      }
    }
    await sleep(HEALTH_CHECK_POLL_MS);
  }

  return { ok: false, port: null, attempts, lastStatus };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
