import {
  AgentError,
  NonRetryableErrorCodes,
  SseEvents,
  buildManifest,
  buildPhasePrompt,
  getErrorCode,
  isOptionalPhase,
  isRetryableError,
  missingInPhase,
  nextPhase,
  validateBuildQuality,
  validateBuildReady,
  normalizeWriteFilesInput,
  parseWriteFilesInput,
  sanitizePersistedText,
  validateVfsPath,
  WriteFilesParseError,
  type AppSpec,
} from "@nebula/shared";
import { prisma } from "../lib/prisma";
import { getActiveLLMProviderId } from "../config/llm-provider";
import { getLLMProvider } from "../providers/llm";
import type { LLMMessage, LLMToolDefinition } from "@nebula/shared";
import { agentRunService } from "./agent-run.service";
import { eventService } from "./event.service";
import { vfsService } from "./vfs.service";
import { projectService } from "./project.service";

const MAX_TOOL_CALLS = 20;
const BUILD_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_PHASE_RETRIES = 2;
const MAX_PHASE_STALLS = 2;

const BUILDER_TOOLS: LLMToolDefinition[] = [
  {
    name: "list_files",
    description: "List all file paths in the project (paths only, no content)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_file",
    description: "Read a single file when you need to edit existing content",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File path e.g. src/app/page.tsx" } },
      required: ["path"],
    },
  },
  {
    name: "write_files",
    description:
      "Create or update multiple files in one call. Prefer this for all new files. Group files by layer (config, prisma, lib, api, pages, components).",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          description: "Array of files to write (up to 40 per call)",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string", description: "Full file content" },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["files"],
    },
  },
  {
    name: "write_file",
    description: "Create or update a single file (use write_files for batches)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the project",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
];

const BUILDER_SYSTEM = `You are the Builder agent for Nebula AI.
You build complete Next.js web applications from specifications.

STACK (FIXED — do not change):
- Next.js 15 App Router
- Prisma ORM with SQLite
- Tailwind CSS
- TypeScript

READY-FIRST PHASES (in order):
1. foundation — config, Prisma, lib, layout (one write_files batch)
2. shell-ui — src/app/page.tsx (required before any API work)
3. api-bulk — collection API routes only (optional for READY)
4. polish — components, dashboard, [id] routes (optional)

EFFICIENCY RULES (CRITICAL):
- You receive ONE phase at a time with an explicit list of missing files.
- Use a single write_files call to write ALL missing files for that phase.
- Do NOT rewrite files that already exist.
- Do NOT use list_files or read_file unless fixing an error.
- Write complete, runnable code. No TODOs. No placeholders.
- File paths use forward slashes (e.g. src/app/page.tsx, prisma/schema.prisma).`;

export class BuilderService {
  async run(
    projectId: string,
    userId: string,
    options: { userMessage?: string; errorContext?: string; attempt?: number } = {}
  ) {
    const project = await projectService.get(projectId, userId);

    if (!project.specJson) {
      throw new AgentError(
        NonRetryableErrorCodes.NO_SPEC,
        "Project has no specification. Run clarifier first.",
        400,
        false
      );
    }

    const spec = project.specJson as AppSpec;
    const attempt = options.attempt ?? 1;

    const run = await agentRunService.start(
      projectId,
      userId,
      "builder",
      options.userMessage ?? JSON.stringify(spec),
      getActiveLLMProviderId()
    );

    const buildStartedAt = Date.now();

    eventService.publish(projectId, SseEvents.BUILD_STARTED, {
      runId: run.id,
      attempt,
      appType: spec.appType,
    });

    eventService.publish(projectId, SseEvents.AGENT_STARTED, {
      agentType: "builder",
      runId: run.id,
      attempt,
    });

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: "building",
      message: attempt > 1 ? `Build retry ${attempt}...` : "Building application...",
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "building" },
    });

    eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
      id: projectId,
      status: "building",
    });

    const deadline = Date.now() + BUILD_TIMEOUT_MS;
    let totalInput = 0;
    let totalOutput = 0;
    let toolCallCount = 0;
    const changedPaths: string[] = [];
    const manifest = buildManifest(spec);
    let phaseStalls = 0;
    let lastStalledPhase: string | null = null;
    let currentPhase: string | null = null;

    try {
      const llm = getLLMProvider();

      while (toolCallCount < MAX_TOOL_CALLS && Date.now() < deadline) {
        const currentFiles = await vfsService.listTree(projectId, userId);
        const existingPaths = currentFiles.map((f) => f.path);

        const phase = nextPhase(manifest, existingPaths);
        if (!phase) {
          break;
        }

        currentPhase = phase.id;
        const missing = missingInPhase(phase, existingPaths);
        let phasePrompt = buildPhasePrompt(spec, phase, missing, existingPaths);

        if (options.errorContext && toolCallCount === 0) {
          phasePrompt += `\n\nPREVIOUS BUILD FAILED:\n${options.errorContext}`;
        }
        if (options.userMessage && toolCallCount === 0) {
          phasePrompt += `\n\nUSER MESSAGE:\n${options.userMessage}`;
        }

        eventService.publish(projectId, SseEvents.PROGRESS, {
          step: "build_phase",
          message: `Building ${phase.name}...`,
          phase: phase.id,
          missing: missing.length,
        });

        let phaseWritten = false;
        let skipOptionalPhase = false;
        for (let phaseAttempt = 0; phaseAttempt <= MAX_PHASE_RETRIES; phaseAttempt++) {
          const messages: LLMMessage[] = [{ role: "user", content: phasePrompt }];
          const result = await llm.generate({
            system: BUILDER_SYSTEM,
            messages,
            tools: BUILDER_TOOLS,
            maxTokens: 16384,
            forcedToolName: "write_files",
            phase: phase.id,
          });

          totalInput += result.inputTokens;
          totalOutput += result.outputTokens;

          if (result.recoveredFromContent) {
            eventService.publish(projectId, SseEvents.DEEPSEEK_TOOL_RECOVERY, {
              phase: phase.id,
              tool: "write_files",
              fileCount: result.toolCalls.filter((c) => c.name === "write_files").length,
            });
          }

          if (result.toolCalls.length === 0) {
            if (phaseAttempt >= MAX_PHASE_RETRIES) break;
            phasePrompt += "\n\nYou must use write_files now. Write all missing files listed above.";
            continue;
          }

          for (const call of result.toolCalls) {
            if (toolCallCount >= MAX_TOOL_CALLS) break;
            if (call.name !== "write_files" && call.name !== "write_file") continue;

            toolCallCount++;

            const pathsHint = this.extractPathsFromInput(call.name, call.input);
            eventService.publish(projectId, SseEvents.AGENT_PROGRESS, {
              agentType: "builder",
              tool: call.name,
              phase: phase.id,
              path: pathsHint,
            });

            try {
              await this.executeTool(projectId, userId, call.name, call.input, changedPaths);
            } catch (toolErr) {
              const code = getErrorCode(toolErr);
              const toolMsg =
                toolErr instanceof AgentError
                  ? `${toolErr.code}: ${toolErr.message}`
                  : toolErr instanceof Error
                    ? toolErr.message
                    : JSON.stringify(toolErr);

              if (isOptionalPhase(phase)) {
                console.warn(
                  `[builder] Optional phase ${phase.id} write failed, continuing: ${toolMsg}`
                );
                skipOptionalPhase = true;
                break;
              }

              const errorCode =
                code === NonRetryableErrorCodes.VALIDATION_ERROR ||
                code === NonRetryableErrorCodes.VFS_WRITE_ERROR
                  ? code
                  : NonRetryableErrorCodes.PHASE_WRITE_FAILED;
              throw new AgentError(
                errorCode,
                `Phase ${phase.id} failed during ${call.name}: ${toolMsg}`,
                500,
                false
              );
            }
          }

          if (skipOptionalPhase) {
            break;
          }

          const afterPaths = (await vfsService.listTree(projectId, userId)).map((f) => f.path);
          const stillMissing = missingInPhase(phase, afterPaths);
          if (stillMissing.length === 0) {
            phaseWritten = true;
            phaseStalls = 0;
            lastStalledPhase = null;
            break;
          }

          if (phaseAttempt >= MAX_PHASE_RETRIES) break;
          phasePrompt = buildPhasePrompt(spec, phase, stillMissing, afterPaths);
          phasePrompt += "\n\nPrevious attempt did not write all files. Write the remaining files now.";
        }

        if (!phaseWritten) {
          if (isOptionalPhase(phase)) {
            console.warn(`[builder] Skipping incomplete optional phase ${phase.id}`);
            phaseStalls = 0;
            lastStalledPhase = null;
            continue;
          }

          if (lastStalledPhase === phase.id) {
            phaseStalls++;
          } else {
            phaseStalls = 1;
            lastStalledPhase = phase.id;
          }
          if (phaseStalls >= MAX_PHASE_STALLS) {
            throw new AgentError(
              NonRetryableErrorCodes.PHASE_WRITE_FAILED,
              `Phase ${phase.id} stalled after ${MAX_PHASE_STALLS} attempts without writing required files`,
              422,
              false
            );
          }
          continue;
        }
      }

      const finalFiles = await vfsService.listTree(projectId, userId);
      const paths = finalFiles.map((f) => f.path);
      const buildDurationMs = Date.now() - buildStartedAt;

      const metrics = {
        toolCalls: toolCallCount,
        filesGenerated: finalFiles.length,
        buildDurationMs,
      };

      if (finalFiles.length === 0) {
        throw new Error("Builder completed but no files were written");
      }

      const readyValidation = validateBuildReady({ paths, spec });
      if (!readyValidation.ok) {
        const reason = readyValidation.errors.join("; ");
        throw new AgentError(
          NonRetryableErrorCodes.BUILD_INCOMPLETE,
          reason,
          422,
          false
        );
      }

      const qualityValidation = validateBuildQuality({ paths, spec });
      const qualityNote = qualityValidation.ok
        ? ""
        : ` Note: ${qualityValidation.errors.join("; ")}`;

      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "ready",
          buildCount: { increment: 1 },
        },
      });

      const summary = `Built ${finalFiles.length} files in ${toolCallCount} tool calls (${(buildDurationMs / 1000).toFixed(1)}s)${qualityNote}`;
      await agentRunService.complete(run.id, summary, totalInput, totalOutput, metrics);

      eventService.publish(projectId, SseEvents.BUILD_COMPLETED, {
        runId: run.id,
        fileCount: finalFiles.length,
        toolCalls: toolCallCount,
        buildDurationMs,
        attempt,
      });

      eventService.publish(projectId, SseEvents.AGENT_COMPLETED, {
        agentType: "builder",
        runId: run.id,
        fileCount: finalFiles.length,
      });

      eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
        id: projectId,
        status: "ready",
      });

      eventService.publish(projectId, SseEvents.PROGRESS, {
        step: "build_complete",
        message: `Build complete — ${finalFiles.length} files, ${toolCallCount} tool calls`,
      });

      const message = await prisma.message.create({
        data: {
          projectId,
          role: "assistant",
          content: `Build complete! Generated ${finalFiles.length} files for ${spec.name} in ${(buildDurationMs / 1000).toFixed(0)}s. Check the file tree to explore your app.`,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);

      return {
        fileCount: finalFiles.length,
        files: finalFiles,
        toolCalls: toolCallCount,
        buildDurationMs,
        tokensInput: totalInput,
        tokensOutput: totalOutput,
      };
    } catch (err) {
      const msg = sanitizePersistedText(
        err instanceof Error ? err.message : "Builder failed"
      );
      const errorCode = getErrorCode(err) ?? "BUILD_FAILED";
      const buildDurationMs = Date.now() - buildStartedAt;
      const metrics = {
        toolCalls: toolCallCount,
        filesGenerated: (
          await vfsService.listTree(projectId, userId).catch(() => [])
        ).length,
        buildDurationMs,
      };
      const failure = {
        errorCode,
        failurePhase: currentPhase ?? undefined,
        retryCount: attempt - 1,
      };

      await agentRunService.fail(run.id, msg, totalInput, totalOutput, metrics, failure);

      if (!isRetryableError(err)) {
        await this.markFailed(
          projectId,
          run.id,
          msg,
          totalInput,
          totalOutput,
          metrics,
          attempt,
          failure
        );
      } else {
        eventService.publish(projectId, SseEvents.BUILD_FAILED, {
          runId: run.id,
          attempt,
          error: msg,
          errorCode,
          phase: currentPhase,
          retryCount: failure.retryCount,
          toolCalls: metrics.toolCalls,
          buildDurationMs: metrics.buildDurationMs,
          retryable: true,
        });
      }

      throw err;
    }
  }

  private async markFailed(
    projectId: string,
    runId: string,
    msg: string,
    totalInput: number,
    totalOutput: number,
    metrics: { toolCalls: number; filesGenerated: number; buildDurationMs: number },
    attempt: number,
    failure: { errorCode?: string; failurePhase?: string; retryCount?: number }
  ) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });

    const phaseLabel = failure.failurePhase ?? "unknown";
    const codeLabel = failure.errorCode ?? "BUILD_FAILED";
    const retryLabel = failure.retryCount ?? attempt - 1;
    const feedMessage = `Build failed in phase ${phaseLabel} (${codeLabel}): ${msg}`;

    eventService.publish(projectId, SseEvents.BUILD_FAILED, {
      runId,
      attempt,
      error: msg,
      message: feedMessage,
      errorCode: codeLabel,
      phase: failure.failurePhase,
      retryCount: retryLabel,
      toolCalls: metrics.toolCalls,
      buildDurationMs: metrics.buildDurationMs,
    });

    eventService.publish(projectId, SseEvents.AGENT_FAILED, {
      agentType: "builder",
      runId,
      error: msg,
      errorCode: codeLabel,
      phase: failure.failurePhase,
      retryCount: retryLabel,
    });

    eventService.publish(projectId, SseEvents.PROGRESS, {
      step: "build_failed",
      message: feedMessage,
      errorCode: codeLabel,
      phase: failure.failurePhase,
      retryCount: retryLabel,
    });

    eventService.publish(projectId, SseEvents.PROJECT_UPDATED, {
      id: projectId,
      status: "failed",
    });

    const message = await prisma.message.create({
      data: {
        projectId,
        role: "assistant",
        content: sanitizePersistedText(`${feedMessage}\n\nRetries: ${retryLabel}`),
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    eventService.publish(projectId, SseEvents.MESSAGE_CREATED, message);
  }

  private extractPathsFromInput(name: string, input: Record<string, unknown>): string | undefined {
    if (name === "write_files") {
      const { files } = normalizeWriteFilesInput(input);
      return files.map((f) => f.path).join(", ") || undefined;
    }
    return (input.path as string) ?? undefined;
  }

  private async executeTool(
    projectId: string,
    userId: string,
    name: string,
    input: Record<string, unknown>,
    changedPaths: string[]
  ) {
    switch (name) {
      case "list_files": {
        const files = await vfsService.listTree(projectId, userId);
        return files.map((f) => ({ path: f.path, version: f.version }));
      }
      case "read_file": {
        const validated = this.validateToolPath(input.path);
        return vfsService.readFile(projectId, userId, validated);
      }
      case "write_files": {
        let parsedFiles;
        try {
          parsedFiles = parseWriteFilesInput(input);
        } catch (err) {
          const message =
            err instanceof WriteFilesParseError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Invalid write_files input";
          throw new AgentError(
            NonRetryableErrorCodes.VALIDATION_ERROR,
            message,
            400,
            false
          );
        }

        if (parsedFiles.recovered || parsedFiles.warnings.length > 0) {
          eventService.publish(projectId, SseEvents.PROGRESS, {
            step: "write_files_recovered",
            message: `Recovered write_files payload (${parsedFiles.files.length} file${parsedFiles.files.length === 1 ? "" : "s"})`,
            warnings: parsedFiles.warnings,
            recovered: parsedFiles.recovered,
            paths: parsedFiles.files.map((f) => f.path),
          });
        }

        const validated = parsedFiles.files.map((f) => ({
          path: this.validateToolPath(f.path),
          content: f.content,
        }));
        const result = await vfsService.writeFiles(projectId, userId, validated);
        for (const path of result.written) {
          if (!changedPaths.includes(path)) changedPaths.push(path);
        }
        return result;
      }
      case "write_file": {
        const validated = this.validateToolPath(input.path);
        const content = input.content as string;
        if (content === undefined) {
          throw new AgentError(
            NonRetryableErrorCodes.VALIDATION_ERROR,
            "content is required",
            400,
            false
          );
        }
        const result = await vfsService.writeFile(projectId, userId, validated, content);
        if (!changedPaths.includes(validated)) changedPaths.push(validated);
        return result;
      }
      case "delete_file": {
        const validated = this.validateToolPath(input.path);
        return vfsService.deleteFile(projectId, userId, validated);
      }
      default:
        throw new AgentError(
          NonRetryableErrorCodes.VALIDATION_ERROR,
          `Unknown tool: ${name}`,
          400,
          false
        );
    }
  }

  private validateToolPath(path: unknown): string {
    const result = validateVfsPath(path);
    if (!result.ok) {
      throw new AgentError(
        NonRetryableErrorCodes.VALIDATION_ERROR,
        result.message,
        400,
        false
      );
    }
    return result.path;
  }
}

export const builderService = new BuilderService();

/** @deprecated Use AgentError */
export const BuilderError = AgentError;
