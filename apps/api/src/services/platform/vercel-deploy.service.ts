import { env } from "../../config/env";

export interface VfsFile {
  path: string;
  content: string;
}

export class VercelDeployService {
  isConfigured() {
    return Boolean(env.VERCEL_TOKEN);
  }

  async deployProject(
    name: string,
    files: VfsFile[],
    envVars: Record<string, string> = {}
  ): Promise<{ url: string; deploymentId: string }> {
    if (!env.VERCEL_TOKEN) {
      throw new Error("VERCEL_TOKEN not configured");
    }

    const vercelFiles = files.map((f) => ({
      file: f.path.replace(/\\/g, "/"),
      data: f.content,
    }));

    const body = {
      name: name.slice(0, 50).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      files: vercelFiles,
      projectSettings: {
        framework: "nextjs",
        env: envVars,
      },
      target: "production",
    };

    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(data.error?.message ?? `Vercel API ${res.status}`);
    }

    const deploymentId = data.id ?? "unknown";
    const url = data.url
      ? data.url.startsWith("http")
        ? data.url
        : `https://${data.url}`
      : `https://${deploymentId}.vercel.app`;

    return { url, deploymentId };
  }
}

export const vercelDeployService = new VercelDeployService();
