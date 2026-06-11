import {
  AgentError,
  NonRetryableErrorCodes,
  validateVfsPath,
} from "@nebula/shared";
import { prisma } from "../lib/prisma";
import { vfsService } from "./vfs.service";

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const READ_TOOLS: AgentToolDefinition[] = [
  {
    name: "list_files",
    description: "List all file paths in the project",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_file",
    description: "Read a single file by path",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search files and symbols by query",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

const WRITE_TOOLS: AgentToolDefinition[] = [
  {
    name: "write_file",
    description: "Create or update a single file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
];

export class AgentToolRegistry {
  listTools(allowWrites: boolean): AgentToolDefinition[] {
    return allowWrites ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
  }

  async execute(
    projectId: string,
    userId: string,
    name: string,
    input: Record<string, unknown>,
    allowWrites: boolean
  ) {
    if (!allowWrites && (name === "write_file" || name === "write_files")) {
      throw new AgentError(
        NonRetryableErrorCodes.VALIDATION_ERROR,
        "Write tools are disabled for this project MCP bridge",
        403,
        false
      );
    }

    switch (name) {
      case "list_files": {
        const files = await vfsService.listTree(projectId, userId);
        return files.map((f) => ({ path: f.path, version: f.version }));
      }
      case "read_file": {
        const path = this.validatePath(input.path);
        return vfsService.readFile(projectId, userId, path);
      }
      case "search_files": {
        const query = String(input.query ?? "").trim();
        if (!query) return [];
        return vfsService.searchFiles(projectId, userId, query, 20);
      }
      case "write_file": {
        const path = this.validatePath(input.path);
        const content = input.content as string;
        if (content === undefined) {
          throw new AgentError(
            NonRetryableErrorCodes.VALIDATION_ERROR,
            "content is required",
            400,
            false
          );
        }
        return vfsService.writeFile(projectId, userId, path, content, {
          source: "agent",
        });
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

  private validatePath(path: unknown): string {
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

  async getProjectMcpSettings(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { mcpAllowWrites: true, mcpServers: true },
    });
    return {
      allowWrites: project?.mcpAllowWrites ?? false,
      servers: Array.isArray(project?.mcpServers) ? project.mcpServers : [],
    };
  }
}

export const agentToolRegistry = new AgentToolRegistry();
