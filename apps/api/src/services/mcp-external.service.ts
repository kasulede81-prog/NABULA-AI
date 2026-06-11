import type { McpServerConfig } from "./mcp-bridge.service";
import { parsePublicHttpUrl } from "../lib/ssrf-guard";

interface JsonRpcResponse {
  result?: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

const TIMEOUT_MS = 15_000;

export class McpExternalService {
  async listToolsFromServer(server: McpServerConfig) {
    if (!server.enabled || !server.url) return [];
    try {
      const res = await this.rpc(server.url, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      });
      const tools = res.result?.tools ?? [];
      return tools.map((t) => ({
        name: `ext:${server.id}:${t.name}`,
        description: `[${server.name}] ${t.description ?? t.name}`,
        inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        serverId: server.id,
        originalName: t.name,
      }));
    } catch (err) {
      console.warn(`[mcp] Failed to list tools from ${server.name}:`, err);
      return [];
    }
  }

  async callExternalTool(
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>
  ) {
    if (!server.url) {
      throw new Error(`MCP server ${server.name} has no URL`);
    }
    const res = await this.rpc(server.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    if (res.error) {
      throw new Error(res.error.message);
    }
    const text =
      res.result?.content?.map((c) => c.text ?? "").join("\n") ??
      JSON.stringify(res.result);
    return { content: text, isError: res.result?.isError ?? false };
  }

  private async rpc(url: string, body: Record<string, unknown>) {
    // User-configured URL — refuse anything resolving into the internal
    // network (SSRF guard, incl. DNS rebinding).
    const safeUrl = await parsePublicHttpUrl(url);
    if (!safeUrl) {
      throw new Error("MCP server URL is not allowed (private or unresolvable host)");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`MCP HTTP ${res.status}`);
      }
      return (await res.json()) as JsonRpcResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const mcpExternalService = new McpExternalService();
