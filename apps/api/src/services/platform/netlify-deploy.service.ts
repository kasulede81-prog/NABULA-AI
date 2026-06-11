import { env } from "../../config/env";

export interface VfsFile {
  path: string;
  content: string;
}

export class NetlifyDeployService {
  isConfigured() {
    return Boolean(env.NETLIFY_TOKEN);
  }

  async deployProject(
    name: string,
    files: VfsFile[]
  ): Promise<{ url: string; deploymentId: string }> {
    if (!env.NETLIFY_TOKEN) {
      throw new Error("NETLIFY_TOKEN not configured");
    }

    const safeName = name
      .slice(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    const siteRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NETLIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: safeName }),
    });

    const site = (await siteRes.json()) as {
      id?: string;
      ssl_url?: string;
      url?: string;
      error?: string;
    };

    if (!siteRes.ok || !site.id) {
      throw new Error(site.error ?? `Netlify site create ${siteRes.status}`);
    }

    const deployRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${site.id}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NETLIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: Object.fromEntries(
            files.map((f) => [f.path.replace(/\\/g, "/"), f.content])
          ),
        }),
      }
    );

    const deploy = (await deployRes.json()) as {
      id?: string;
      ssl_url?: string;
      deploy_ssl_url?: string;
      error?: string;
    };

    if (!deployRes.ok) {
      throw new Error(deploy.error ?? `Netlify deploy ${deployRes.status}`);
    }

    const url =
      deploy.ssl_url ??
      deploy.deploy_ssl_url ??
      site.ssl_url ??
      site.url ??
      `https://${safeName}.netlify.app`;

    return {
      url: url.startsWith("http") ? url : `https://${url}`,
      deploymentId: deploy.id ?? site.id,
    };
  }
}

export const netlifyDeployService = new NetlifyDeployService();
