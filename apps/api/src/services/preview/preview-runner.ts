import { Sandbox } from "e2b";
import { env } from "../../config/env";
import { eventService } from "../event.service";
import { SseEvents, PreviewPhases, type PreviewPhase } from "@nebula/shared";
import { previewLogStore } from "./preview-log-store";
import {
  detectFramework,
  getBuildCommand,
  getStartCommand,
  parsePackageJson,
} from "./preview-framework";
import { detectPackageManager, getInstallCommand } from "./preview-package-manager";
import {
  extractPortFromLogLine,
  portsToProbe,
  resolveTargetPort,
} from "./preview-port";
import { waitForHealthyServer } from "./preview-health";
import { classifyPreviewFailure } from "./preview-errors";
import { prisma } from "../../lib/prisma";

export interface PreviewRunnerInput {
  projectId: string;
  userId: string;
  previewId: string;
  files: Array<{ path: string; content: string }>;
}

export interface PreviewRunnerResult {
  previewUrl: string;
  sandboxId: string;
  detectedPort: number;
  framework: string;
  packageManager: string;
}

export class PreviewRunner {
  private async setPhase(
    projectId: string,
    previewId: string,
    phase: PreviewPhase,
    extra?: Record<string, unknown>
  ) {
    await prisma.preview.update({
      where: { id: previewId },
      data: { phase },
    });

    eventService.publish(projectId, SseEvents.PREVIEW_PHASE, {
      previewId,
      phase,
      ...extra,
    });

    await previewLogStore.append({
      projectId,
      previewId,
      level: "info",
      source: "system",
      message: `Phase: ${phase}`,
    });
  }

  async run(input: PreviewRunnerInput): Promise<PreviewRunnerResult> {
    const { projectId, previewId, files } = input;

    await this.setPhase(projectId, previewId, PreviewPhases.PREPARING_SANDBOX);

    const framework = detectFramework(files);
    const packageManager = detectPackageManager(files);
    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = parsePackageJson(pkgFile?.content);

    await prisma.preview.update({
      where: { id: previewId },
      data: { framework, packageManager },
    });

    await previewLogStore.append({
      projectId,
      previewId,
      level: "info",
      source: "system",
      message: `Detected framework: ${framework}, package manager: ${packageManager}`,
    });

    const sandbox = await Sandbox.create({
      apiKey: env.E2B_API_KEY,
      template: env.E2B_PREVIEW_TEMPLATE,
      timeoutMs: env.PREVIEW_SANDBOX_TIMEOUT_MS,
    });

    await prisma.preview.update({
      where: { id: previewId },
      data: { sandboxId: sandbox.sandboxId },
    });

    await previewLogStore.append({
      projectId,
      previewId,
      level: "info",
      source: "system",
      message: `Sandbox created: ${sandbox.sandboxId}`,
    });

    await sandbox.files.write(files.map((f) => ({ path: f.path, data: f.content })));

    await previewLogStore.append({
      projectId,
      previewId,
      level: "info",
      source: "system",
      message: `Wrote ${files.length} files to isolated workspace`,
    });

    await this.setPhase(projectId, previewId, PreviewPhases.INSTALLING_DEPENDENCIES);

    const installCmd = getInstallCommand(packageManager);
    const installResult = await sandbox.commands.run(installCmd, { timeoutMs: 300_000 });
    await previewLogStore.appendCommandOutput(
      projectId,
      previewId,
      "install",
      installResult.stdout,
      installResult.stderr,
      installResult.exitCode
    );
    if (installResult.exitCode !== 0) {
      throw new Error(installResult.stderr || installResult.stdout || "Dependency install failed");
    }

    const hasPrisma = files.some((f) => f.path === "prisma/schema.prisma");
    if (hasPrisma) {
      await previewLogStore.append({
        projectId,
        previewId,
        level: "info",
        source: "system",
        message: "Running Prisma generate and db push...",
      });

      const prismaGen = await sandbox.commands.run("npx prisma generate 2>&1", {
        timeoutMs: 120_000,
      });
      await previewLogStore.appendCommandOutput(
        projectId,
        previewId,
        "build",
        prismaGen.stdout,
        prismaGen.stderr,
        prismaGen.exitCode
      );
      if (prismaGen.exitCode !== 0) {
        throw new Error(prismaGen.stderr || prismaGen.stdout || "prisma generate failed");
      }

      const prismaPush = await sandbox.commands.run(
        "npx prisma db push --accept-data-loss 2>&1",
        { timeoutMs: 120_000 }
      );
      await previewLogStore.appendCommandOutput(
        projectId,
        previewId,
        "build",
        prismaPush.stdout,
        prismaPush.stderr,
        prismaPush.exitCode
      );
      if (prismaPush.exitCode !== 0) {
        throw new Error(prismaPush.stderr || prismaPush.stdout || "prisma db push failed");
      }
    }

    const targetPort = resolveTargetPort(framework, pkg);
    const buildCmd = getBuildCommand(pkg, packageManager);
    const startPlan = getStartCommand(framework, pkg, targetPort, packageManager);

    if (buildCmd && startPlan.needsBuild) {
      await this.setPhase(projectId, previewId, PreviewPhases.BUILDING_PROJECT);
      const buildResult = await sandbox.commands.run(buildCmd, { timeoutMs: 300_000 });
      await previewLogStore.appendCommandOutput(
        projectId,
        previewId,
        "build",
        buildResult.stdout,
        buildResult.stderr,
        buildResult.exitCode
      );
      if (buildResult.exitCode !== 0) {
        throw new Error(buildResult.stderr || buildResult.stdout || "Build failed");
      }
    }

    await this.setPhase(projectId, previewId, PreviewPhases.STARTING_SERVER);

    const startCmd = startPlan.command;

    const startResult = await sandbox.commands.run(startCmd, { timeoutMs: 15_000 });
    await previewLogStore.appendCommandOutput(
      projectId,
      previewId,
      "runtime",
      startResult.stdout,
      startResult.stderr,
      startResult.exitCode
    );

    await sandbox.commands.run("sleep 2", { timeoutMs: 5_000 });

    const runtimeTail = await sandbox.commands.run(
      "tail -n 80 /tmp/preview-runtime.log 2>/dev/null || true",
      { timeoutMs: 10_000 }
    );
    if (runtimeTail.stdout) {
      for (const line of runtimeTail.stdout.split("\n").filter(Boolean)) {
        await previewLogStore.append({
          projectId,
          previewId,
          level: "stdout",
          source: "runtime",
          message: line,
        });
      }
    }

    let detectedPort = targetPort;
    for (const line of runtimeTail.stdout.split("\n")) {
      const fromLog = extractPortFromLogLine(line);
      if (fromLog) {
        detectedPort = fromLog;
        break;
      }
    }

    await this.setPhase(projectId, previewId, PreviewPhases.WAITING_FOR_HEALTH_CHECK, {
      detectedPort,
    });

    let lastRuntimeLine = 0;
    const health = await waitForHealthyServer(
      sandbox,
      portsToProbe(detectedPort),
      async (port, status) => {
        const runtimeTail = await sandbox.commands.run(
          "wc -l < /tmp/preview-runtime.log 2>/dev/null || echo 0",
          { timeoutMs: 5_000 }
        );
        const totalLines = Number(runtimeTail.stdout.trim()) || 0;
        if (totalLines > lastRuntimeLine) {
          const newLines = await sandbox.commands.run(
            `tail -n +${lastRuntimeLine + 1} /tmp/preview-runtime.log 2>/dev/null | head -n 50`,
            { timeoutMs: 5_000 }
          );
          for (const line of newLines.stdout.split("\n").filter(Boolean)) {
            const fromLog = extractPortFromLogLine(line);
            if (fromLog) detectedPort = fromLog;
            await previewLogStore.append({
              projectId,
              previewId,
              level: "stdout",
              source: "runtime",
              message: line,
            });
          }
          lastRuntimeLine = totalLines;
        }

        await previewLogStore.append({
          projectId,
          previewId,
          level: status && status >= 200 && status < 400 ? "info" : "warn",
          source: "health",
          message: `Health probe port ${port}: HTTP ${status ?? "timeout"}`,
        });
      }
    );

    if (!health.ok || health.port === null) {
      const runtimeLog = await sandbox.commands.run(
        "tail -n 120 /tmp/preview-runtime.log 2>/dev/null || true",
        { timeoutMs: 10_000 }
      );
      await previewLogStore.appendCommandOutput(
        projectId,
        previewId,
        "runtime",
        runtimeLog.stdout,
        runtimeLog.stderr,
        1
      );
      throw new Error(
        `Health check failed after ${health.attempts} attempts (last status: ${health.lastStatus ?? "none"})`
      );
    }

    detectedPort = health.port;

    const host = sandbox.getHost(detectedPort);
    const previewUrl = host.startsWith("http") ? host : `https://${host}`;

    await this.setPhase(projectId, previewId, PreviewPhases.PREVIEW_READY, {
      previewUrl,
      detectedPort,
    });

    return {
      previewUrl,
      sandboxId: sandbox.sandboxId,
      detectedPort,
      framework,
      packageManager,
    };
  }

  wrapFailure(err: unknown, phase?: PreviewPhase) {
    const raw = err instanceof Error ? err.message : String(err);
    return classifyPreviewFailure(raw, { phase });
  }
}

export const previewRunner = new PreviewRunner();
