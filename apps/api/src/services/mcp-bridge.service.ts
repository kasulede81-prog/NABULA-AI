import { z } from "zod";
import { prisma } from "../lib/prisma";
import { projectService } from "./project.service";
import { agentToolRegistry } from "./agent-tool-registry.service";
import { mcpExternalService } from "./mcp-external.service";

const mcpServerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  url: z.string().url().optional(),
  enabled: z.boolean().default(true),
});

export type McpServerConfig = z.infer<typeof mcpServerSchema>;

export const updateMcpConfigSchema = z.object({
  servers: z.array(mcpServerSchema).max(10),
  allowWrites: z.boolean().optional(),
});

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export class McpBridgeService {
  async getConfig(projectId: string, userId: string) {
    await projectService.get(projectId, userId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { mcpServers: true, mcpAllowWrites: true },
    });
    const servers = Array.isArray(project.mcpServers)
      ? (project.mcpServers as McpServerConfig[])
      : [];
    const builtinTools = agentToolRegistry.listTools(project.mcpAllowWrites);
    const externalTools = (
      await Promise.all(
        servers.map((s) => mcpExternalService.listToolsFromServer(s))
      )
    ).flat();

    return {
      allowWrites: project.mcpAllowWrites,
      servers,
      builtinTools,
      externalTools: externalTools.map(({ serverId, originalName, ...t }) => t),
    };
  }

  async updateConfig(
    projectId: string,
    userId: string,
    input: z.infer<typeof updateMcpConfigSchema>
  ) {
    await projectService.get(projectId, userId);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        mcpServers: input.servers,
        ...(input.allowWrites !== undefined
          ? { mcpAllowWrites: input.allowWrites }
          : {}),
      },
    });
    return this.getConfig(projectId, userId);
  }

  async handleRpc(projectId: string, userId: string, body: JsonRpcRequest) {
    await projectService.get(projectId, userId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { mcpServers: true, mcpAllowWrites: true },
    });
    const servers = Array.isArray(project.mcpServers)
      ? (project.mcpServers as McpServerConfig[])
      : [];
    const allowWrites = project.mcpAllowWrites;
    const id = body.id ?? null;

    switch (body.method) {
      case "initialize":
        return this.ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "nebula-mcp", version: "1.1.0" },
        });

      case "tools/list": {
        const builtin = agentToolRegistry.listTools(allowWrites).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        const external = (
          await Promise.all(
            servers.map((s) => mcpExternalService.listToolsFromServer(s))
          )
        ).flat();
        return this.ok(id, {
          tools: [
            ...builtin,
            ...external.map(({ serverId, originalName, ...t }) => t),
          ],
        });
      }

      case "tools/call": {
        const params = body.params ?? {};
        const name = String(params.name ?? "");
        const args =
          (params.arguments as Record<string, unknown> | undefined) ?? {};

        if (name.startsWith("ext:")) {
          const [, serverId, ...rest] = name.split(":");
          const originalName = rest.join(":");
          const server = servers.find((s) => s.id === serverId);
          if (!server) {
            return this.err(id, -32602, `Unknown MCP server: ${serverId}`);
          }
          const result = await mcpExternalService.callExternalTool(
            server,
            originalName,
            args
          );
          return this.ok(id, {
            content: [{ type: "text", text: result.content }],
            isError: result.isError,
          });
        }

        const result = await agentToolRegistry.execute(
          projectId,
          userId,
          name,
          args,
          allowWrites
        );
        return this.ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      }

      default:
        return this.err(id, -32601, `Method not found: ${body.method}`);
    }
  }

  private ok(id: string | number | null, result: unknown) {
    return { jsonrpc: "2.0", id, result };
  }

  private err(id: string | number | null, code: number, message: string) {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }
}

export const mcpBridgeService = new McpBridgeService();
