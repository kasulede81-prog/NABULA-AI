import { buildApp } from "./app";
import { env } from "./config/env";
import { logAgentReadinessWarning } from "./config/agent-readiness";
import { assertSupabaseServerConfig } from "./config/supabase-readiness";
import { previewLifecycleService } from "./services/preview-lifecycle.service";

async function main() {
  assertSupabaseServerConfig();
  logAgentReadinessWarning();
  const app = await buildApp();
  previewLifecycleService.start();

  const shutdown = () => {
    previewLifecycleService.stop();
    void app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    console.log(`API running at http://${env.API_HOST}:${env.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
