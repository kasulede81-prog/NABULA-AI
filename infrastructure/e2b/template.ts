import path from "path";
import { Template } from "e2b";

/** E2B template alias — pre-installs the generated nextjs-prisma-tailwind stack. */
export const PREVIEW_TEMPLATE_NAME = "nebula-nextjs-prisma";

const packageJson = path.join(__dirname, "package.json");

/**
 * Node 20 + Next.js 15 + Prisma 6 + Tailwind + TypeScript.
 * npm install runs at template build time (2048 MB); previews skip runtime install.
 */
export const template = Template()
  .fromNodeImage("20")
  .setWorkdir("/home/user")
  .copy(packageJson, "/home/user/package.json")
  .npmInstall();
