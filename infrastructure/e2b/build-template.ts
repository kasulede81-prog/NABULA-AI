import path from "path";
import { config } from "dotenv";
import { Template, defaultBuildLogger } from "e2b";
import { template, PREVIEW_TEMPLATE_NAME } from "./template";

config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  if (!process.env.E2B_API_KEY) {
    console.error("E2B_API_KEY is required to build the preview template.");
    process.exit(1);
  }

  console.log(`Building E2B template "${PREVIEW_TEMPLATE_NAME}" (cpu=2, memory=2048 MB)...`);

  await Template.build(template, PREVIEW_TEMPLATE_NAME, {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`Template "${PREVIEW_TEMPLATE_NAME}" built successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
