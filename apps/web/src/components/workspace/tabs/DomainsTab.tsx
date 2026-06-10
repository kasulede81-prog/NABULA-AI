"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Plus, Trash2, Check, AlertCircle, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

import { DEPLOY_IP } from "@/lib/brand";

export function DomainsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<
    Array<{ id: string; host: string; status: string }>
  >([]);
  const [host, setHost] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await api.listProjectDomains(projectId);
    setDomains(res.data);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setLoading(true);
    try {
      await api.addProjectDomain(projectId, host);
      setHost("");
      await load();
    } catch (err) {
      toast({
        title: "Invalid domain",
        description:
          (err as { error?: { message?: string } }).error?.message ??
          "e.g. yourapp.com",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (domainId: string) => {
    await api.removeProjectDomain(projectId, domainId);
    await load();
  };

  const verify = async (domainId: string, hostName: string) => {
    try {
      await api.verifyProjectDomain(projectId, domainId);
      toast({ title: "Verified", description: `${hostName} is now live.` });
      await load();
    } catch (err) {
      toast({
        title: "Verify failed",
        description:
          (err as { error?: { message?: string } }).error?.message ?? "Unknown",
        variant: "destructive",
      });
    }
  };

  const copy = (s: string) => {
    void navigator.clipboard.writeText(s);
    toast({ title: "Copied" });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-card/40 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="h-4 w-4 text-primary" /> Custom domains
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Point your domain at{" "}
          <span className="font-mono text-foreground">{DEPLOY_IP}</span> with an
          A record, then verify.
        </p>
      </div>

      <div className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex gap-2">
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={loading}
            placeholder="yourapp.com"
            className="flex-1 rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={loading || !host.trim()}
            className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {domains.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No domains connected yet.
          </div>
        )}
        {domains.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{d.host}</span>
                {d.status === "active" && (
                  <span className="flex items-center gap-1 rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
                    <Check className="h-2.5 w-2.5" /> Active
                  </span>
                )}
                {d.status === "pending" && (
                  <span className="flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] text-warning">
                    <AlertCircle className="h-2.5 w-2.5" /> Pending DNS
                  </span>
                )}
              </div>
              {d.status === "pending" && (
                <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>A @ {DEPLOY_IP}</span>
                    <button type="button" onClick={() => copy(DEPLOY_IP)}>
                      <Copy className="h-3 w-3 hover:text-foreground" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            {d.status !== "active" && (
              <button
                type="button"
                onClick={() => void verify(d.id, d.host)}
                className="rounded-md bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
              >
                Verify
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove(d.id)}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
