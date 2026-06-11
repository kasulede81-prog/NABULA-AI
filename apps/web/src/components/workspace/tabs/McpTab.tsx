"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface McpServer {
  id: string;
  name: string;
  url?: string;
  enabled: boolean;
}

export function McpTab({ projectId }: { projectId: string }) {
  const [allowWrites, setAllowWrites] = useState(false);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [builtinTools, setBuiltinTools] = useState<
    Array<{ name: string; description: string }>
  >([]);
  const [externalTools, setExternalTools] = useState<
    Array<{ name: string; description: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMcpConfig(projectId);
      setAllowWrites(res.data.allowWrites);
      setServers(res.data.servers);
      setBuiltinTools(res.data.builtinTools);
      setExternalTools(res.data.externalTools ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateMcpConfig(projectId, { servers, allowWrites });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const testListFiles = async () => {
    setTestResult(null);
    try {
      const res = await api.invokeMcp(projectId, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_files", arguments: {} },
      });
      setTestResult(JSON.stringify(res, null, 2));
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setTestResult(e.error?.message ?? "MCP call failed");
    }
  };

  const addServer = () => {
    setServers((prev) => [
      ...prev,
      {
        id: `server-${prev.length + 1}`,
        name: "External MCP",
        url: "",
        enabled: false,
      },
    ]);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading MCP config…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">MCP bridge</h2>
        <p className="text-sm text-muted-foreground">
          Expose project tools via MCP JSON-RPC. Connect external MCP clients to{" "}
          <code className="text-xs">POST /v1/projects/{projectId}/mcp</code>
        </p>
      </div>

      <section className="mb-6 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">Built-in tools</h3>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {builtinTools.map((t) => (
            <li key={t.name}>
              <span className="font-mono text-foreground">{t.name}</span> —{" "}
              {t.description}
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowWrites}
            onChange={(e) => setAllowWrites(e.target.checked)}
          />
          Allow write_file via MCP (off by default)
        </label>
        <div className="mt-3 flex gap-2">
          <Button className="px-3 py-1 text-xs" onClick={() => void save()} loading={saving}>
            Save
          </Button>
          <Button
            variant="ghost"
            className="px-3 py-1 text-xs"
            onClick={() => void testListFiles()}
          >
            Test list_files
          </Button>
        </div>
        {testResult && (
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-secondary/40 p-2 text-[11px]">
            {testResult}
          </pre>
        )}
      </section>

      <section className="rounded-lg border border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">External MCP servers</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={addServer}>
            Add server
          </Button>
        </div>
        {externalTools.length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
            {externalTools.map((t) => (
              <li key={t.name}>
                <span className="font-mono text-primary">{t.name}</span> —{" "}
                {t.description}
              </li>
            ))}
          </ul>
        )}
        <p className="mb-3 text-xs text-muted-foreground">
          Register HTTP MCP servers — tools are proxied as{" "}
          <code className="text-[10px]">ext:serverId:toolName</code>. Built-in
          Nebula tools are always available.
        </p>
        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No external servers configured.</p>
        ) : (
          <div className="space-y-3">
            {servers.map((s, idx) => (
              <div key={s.id} className="grid gap-2 rounded border border-border p-3">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setServers((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, name: e.target.value } : row
                      )
                    )
                  }
                  placeholder="Server name"
                  className="rounded border border-border bg-input/40 px-2 py-1 text-sm"
                />
                <input
                  value={s.url ?? ""}
                  onChange={(e) =>
                    setServers((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, url: e.target.value } : row
                      )
                    )
                  }
                  placeholder="https://mcp.example.com (optional)"
                  className="rounded border border-border bg-input/40 px-2 py-1 font-mono text-xs"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) =>
                      setServers((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, enabled: e.target.checked } : row
                        )
                      )
                    }
                  />
                  Enabled
                </label>
              </div>
            ))}
          </div>
        )}
        {servers.length > 0 && (
          <Button
            className="mt-3 px-3 py-1 text-xs"
            onClick={() => void save()}
            loading={saving}
          >
            Save servers
          </Button>
        )}
      </section>
    </div>
  );
}
