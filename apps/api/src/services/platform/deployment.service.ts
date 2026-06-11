import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { decryptSecret } from "../../lib/token-crypto";
import { vercelDeployService } from "./vercel-deploy.service";
import { netlifyDeployService } from "./netlify-deploy.service";
import { notificationService } from "../notification.service";

type DeployStatus =
  | "queued"
  | "building"
  | "deploying"
  | "ready"
  | "error"
  | "canceled";
type DeployTarget = "vercel" | "netlify" | "mock";

function defaultDeployTarget(): DeployTarget {
  if (env.VERCEL_TOKEN) return "vercel";
  if (env.NETLIFY_TOKEN) return "netlify";
  return "mock";
}

export type DeployLogEntry = {
  t: string;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
};

function parseLogs(raw: unknown): DeployLogEntry[] {
  return Array.isArray(raw) ? (raw as DeployLogEntry[]) : [];
}

export class DeploymentService {
  private async appendLog(
    deploymentId: string,
    status: DeployStatus,
    msg: string,
    level: DeployLogEntry["level"] = "info"
  ) {
    const row = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { logs: true },
    });
    const logs = parseLogs(row?.logs);
    logs.push({ t: new Date().toISOString(), level, msg });
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { logs, status },
    });
  }

  async create(
    projectId: string,
    userId: string,
    input: { target?: DeployTarget; commitMessage?: string }
  ) {
    const target = input.target ?? defaultDeployTarget();
    const envRows = await prisma.projectEnvVar.findMany({
      where: { projectId, environment: "production" },
    });
    const envSnapshot: Record<string, string> = {};
    for (const row of envRows) {
      try {
        envSnapshot[row.key] = decryptSecret(row.value);
      } catch {
        envSnapshot[row.key] = row.value;
      }
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        triggeredById: userId,
        target,
        status: "queued",
        commitMessage:
          input.commitMessage?.trim() ||
          `Deploy ${new Date().toISOString()}`,
        logs: [
          {
            t: new Date().toISOString(),
            level: "info",
            msg: "▲ Deployment queued",
          },
        ],
        envSnapshot,
      },
    });

    setImmediate(() => {
      this.runDeployment(
        deployment.id,
        projectId,
        userId,
        target,
        envSnapshot
      ).catch((err) => {
        console.error(`[deploy] Failed for ${deployment.id}:`, err);
      });
    });

    return deployment;
  }

  private async runDeployment(
    deploymentId: string,
    projectId: string,
    userId: string,
    target: DeployTarget,
    envSnapshot: Record<string, string>
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, status: true },
    });
    if (!project) return;

    if (project.status !== "ready") {
      await this.appendLog(
        deploymentId,
        "error",
        "Project must be in ready status before deploying",
        "error"
      );
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { error: "Project not ready" },
      });
      return;
    }

    if (target === "vercel" && vercelDeployService.isConfigured()) {
      await this.deployToVercel(
        deploymentId,
        projectId,
        userId,
        project.name,
        project.slug,
        envSnapshot
      );
      return;
    }

    if (target === "netlify" && netlifyDeployService.isConfigured()) {
      await this.deployToNetlify(
        deploymentId,
        projectId,
        userId,
        project.name,
        project.slug
      );
      return;
    }

    const fileCount = await prisma.file.count({ where: { projectId } });

    if (target === "vercel" && !env.VERCEL_TOKEN) {
      await this.appendLog(
        deploymentId,
        "building",
        `Preparing ${fileCount} files — VERCEL_TOKEN not configured`,
        "warn"
      );
    } else if (target === "netlify" && !env.NETLIFY_TOKEN) {
      await this.appendLog(
        deploymentId,
        "building",
        `NETLIFY_TOKEN not configured — simulated deploy`,
        "warn"
      );
    }

    await this.simulateDeploy(
      deploymentId,
      projectId,
      userId,
      project.name,
      project.slug
    );
  }

  private async deployToVercel(
    deploymentId: string,
    projectId: string,
    userId: string,
    projectName: string,
    slug: string,
    envSnapshot: Record<string, string>
  ) {
    const files = await prisma.file.findMany({
      where: { projectId },
      select: { path: true, content: true },
    });

    await this.appendLog(
      deploymentId,
      "building",
      `Uploading ${files.length} files to Vercel`
    );
    await this.appendLog(deploymentId, "deploying", "Creating Vercel deployment");

    try {
      const result = await vercelDeployService.deployProject(
        slug || projectName,
        files,
        envSnapshot
      );

      await this.appendLog(
        deploymentId,
        "ready",
        `Live at ${result.url}`,
        "ok"
      );

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { url: result.url, status: "ready" },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { previewUrl: result.url },
      });

      void notificationService
        .create(projectId, userId, {
          type: "deploy.ready",
          title: "Deployment live",
          body: result.url,
          metadata: {
            deploymentId,
            vercelDeploymentId: result.deploymentId,
            url: result.url,
          },
        })
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Vercel deploy failed";
      await this.appendLog(deploymentId, "error", msg, "error");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "error", error: msg },
      });
    }
  }

  private async deployToNetlify(
    deploymentId: string,
    projectId: string,
    userId: string,
    projectName: string,
    slug: string
  ) {
    const files = await prisma.file.findMany({
      where: { projectId },
      select: { path: true, content: true },
    });

    await this.appendLog(
      deploymentId,
      "building",
      `Uploading ${files.length} files to Netlify`
    );
    await this.appendLog(deploymentId, "deploying", "Creating Netlify deployment");

    try {
      const result = await netlifyDeployService.deployProject(
        slug || projectName,
        files
      );

      await this.appendLog(
        deploymentId,
        "ready",
        `Live at ${result.url}`,
        "ok"
      );

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { url: result.url, status: "ready", externalId: result.deploymentId },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { previewUrl: result.url },
      });

      void notificationService
        .create(projectId, userId, {
          type: "deploy.ready",
          title: "Deployment live",
          body: result.url,
          metadata: {
            deploymentId,
            netlifyDeploymentId: result.deploymentId,
            url: result.url,
          },
        })
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Netlify deploy failed";
      await this.appendLog(deploymentId, "error", msg, "error");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "error", error: msg },
      });
    }
  }

  private async simulateDeploy(
    deploymentId: string,
    projectId: string,
    userId: string,
    projectName: string,
    slug: string
  ) {
    const safeSlug =
      slug ||
      projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);
    const url = `https://${safeSlug}-${deploymentId.slice(0, 6)}.${env.UGAZON_DEPLOY_DOMAIN}`;

    const steps: { status: DeployStatus; msg: string; level?: DeployLogEntry["level"] }[] = [
      { status: "building", msg: "Bundling assets" },
      { status: "building", msg: "Optimizing images" },
      { status: "deploying", msg: "Pushing to edge network (24 regions)" },
      { status: "deploying", msg: "Provisioning HTTPS" },
      { status: "ready", msg: `Live at ${url}`, level: "ok" },
    ];

    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 700));
      await this.appendLog(
        deploymentId,
        step.status,
        step.msg,
        step.level ?? "info"
      );
    }

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { url, status: "ready" },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { previewUrl: url },
    });

    void notificationService
      .create(projectId, userId, {
        type: "deploy.ready",
        title: "Deployment live",
        body: url,
        metadata: { deploymentId, url, simulated: true },
      })
      .catch(() => undefined);
  }

  list(projectId: string, limit = 30) {
    return prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  get(deploymentId: string, projectId: string) {
    return prisma.deployment.findFirst({
      where: { id: deploymentId, projectId },
    });
  }

  async aggregateLogs(projectId: string) {
    const deployments = await prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, logs: true },
    });

    const out: (DeployLogEntry & { deployment: string })[] = [];
    for (const d of deployments) {
      for (const l of parseLogs(d.logs)) {
        out.push({ ...l, deployment: d.id.slice(0, 6) });
      }
    }

    const agentRuns = await prisma.agentRun.findMany({
      where: { projectId, status: "failed" },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, errorMessage: true, startedAt: true },
    });

    for (const run of agentRuns) {
      if (run.errorMessage) {
        out.push({
          t: run.startedAt.toISOString(),
          level: "error",
          msg: run.errorMessage,
          deployment: "build",
        });
      }
    }

    out.sort((a, b) => (a.t < b.t ? 1 : -1));
    return out;
  }
}

export const deploymentService = new DeploymentService();
