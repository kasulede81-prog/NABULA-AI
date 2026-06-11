"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

export function EnvVarsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<
    Array<{ id: string; key: string; value: string; environment: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const [env, setEnv] = useState("production");

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const res = await api.listProjectEnvVars(projectId);
      setRows(res.data);
    } catch (err) {
      const e = err as { error?: { code?: string } };
      if (e.error?.code === "FORBIDDEN") setForbidden(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!k.trim()) return;
    try {
      await api.createProjectEnvVar(projectId, { key: k, value: v, environment: env });
      setK("");
      setV("");
      setAdding(false);
      await load();
    } catch (err) {
      toast({
        title: "Couldn't add",
        description:
          (err as { error?: { message?: string } }).error?.message ?? "Failed",
        variant: "destructive",
      });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this variable?")) return;
    try {
      await api.deleteProjectEnvVar(projectId, id);
      await load();
    } catch (err) {
      toast({
        title: "Couldn't delete",
        description:
          (err as { error?: { message?: string } }).error?.message ?? "Failed",
        variant: "destructive",
      });
    }
  };

  if (forbidden) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div className="max-w-xs space-y-3">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Admin role required to view environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <KeyRound className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Environment Variables</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-gradient-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-glow"
        >
          <Plus className="h-3 w-3" /> Add variable
        </button>
      </div>
      {loading ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin">
          {adding && (
            <div className="grid grid-cols-[1fr_1fr_140px_auto] gap-2 border-b border-border bg-secondary/40 p-4">
              <input
                autoFocus
                value={k}
                onChange={(e) => setK(e.target.value.toUpperCase())}
                placeholder="KEY"
                className="rounded-md border border-border bg-input/80 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                value={v}
                onChange={(e) => setV(e.target.value)}
                placeholder="value"
                className="rounded-md border border-border bg-input/80 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="rounded-md border border-border bg-input/80 px-2 text-xs"
              >
                <option value="production">production</option>
                <option value="preview">preview</option>
                <option value="development">development</option>
              </select>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void add()}
                  className="rounded-md bg-gradient-primary px-3 text-xs font-medium text-primary-foreground"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-md bg-secondary px-3 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {rows.length === 0 && !adding && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No environment variables. These get sent to your deployments.
            </div>
          )}
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.id}
                className="group grid grid-cols-[1fr_1.4fr_120px_auto] items-center gap-3 px-4 py-3 transition-smooth hover:bg-secondary/40"
              >
                <span className="font-mono text-xs">{r.key}</span>
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {reveal.has(r.id)
                      ? r.value
                      : "•".repeat(Math.min(20, r.value.length || 8))}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setReveal((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary"
                  >
                    {reveal.has(r.id) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {r.environment}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="grid h-7 w-7 place-items-center rounded text-muted-foreground opacity-0 transition-smooth hover:bg-secondary group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
