"use client";

import { useEffect, useState } from "react";
import {
  Rocket,
  X,
  Globe,
  Loader2,
  Cloud,
  AlertTriangle,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

type LogLine = { t: string; level: string; msg: string };

export function DeployModal({
  open,
  onClose,
  projectId,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}) {
  const { toast } = useToast();
  const [target, setTarget] = useState<"vercel" | "netlify" | "mock">("mock");
  const [commit, setCommit] = useState("");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<{
    status: string;
    url: string | null;
    logs: unknown;
    error: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDeploymentId(null);
      setDeployment(null);
      setCommit("");
      setLastError(null);
      void api.listDeployTargets().then((res) => {
        setTarget(
          (res.defaultTarget as "vercel" | "netlify" | "mock") ?? "vercel"
        );
      });
    }
  }, [open]);

  useEffect(() => {
    if (!deploymentId || !open) return;
    const poll = async () => {
      try {
        const res = await api.getProjectDeployment(projectId, deploymentId);
        setDeployment(res.data);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 1500);
    return () => clearInterval(interval);
  }, [deploymentId, projectId, open]);

  const trigger = async () => {
    setBusy(true);
    setLastError(null);
    try {
      const res = await api.createProjectDeployment(projectId, {
        target,
        commitMessage: commit || undefined,
      });
      setDeploymentId(res.data.deploymentId);
    } catch (e) {
      const msg =
        (e as { error?: { message?: string } }).error?.message ??
        "Failed to start deployment";
      setLastError(msg);
      toast({ title: "Deploy failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const logs = Array.isArray(deployment?.logs)
    ? (deployment!.logs as LogLine[])
    : [];

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in-up place-items-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-[480px] max-w-[92vw] overflow-y-auto rounded-2xl border border-border bg-card shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-primary opacity-20 blur-2xl" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
              <Rocket className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">Deploy {projectName}</h3>
              <p className="font-mono text-xs text-muted-foreground">
                main · {new Date().toLocaleString()}
              </p>
            </div>
          </div>

          {!deploymentId ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  Target
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <TargetBtn
                    active={target === "vercel"}
                    onClick={() => setTarget("vercel")}
                    label="Vercel"
                    sub="Real API deploy"
                  />
                  <TargetBtn
                    active={target === "netlify"}
                    onClick={() => setTarget("netlify")}
                    label="Netlify"
                    sub="Real API deploy"
                  />
                  <TargetBtn
                    active={target === "mock"}
                    onClick={() => setTarget("mock")}
                    label="Mock"
                    sub="Simulate"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  Commit message
                </label>
                <input
                  value={commit}
                  onChange={(e) => setCommit(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <button
                type="button"
                onClick={() => void trigger()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-primary py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Deploy to {target}
              </button>
              {lastError && (
                <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-destructive">
                      Deploy error
                    </div>
                    <div className="mt-0.5 break-words font-mono text-[11px] text-destructive/80">
                      {lastError}
                    </div>
                  </div>
                </div>
              )}
              <p className="text-center text-[10px] text-muted-foreground">
                Env vars from this project will be sent automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  deployment?.status === "ready" &&
                    "border-success/40 bg-success/5",
                  deployment?.status === "error" &&
                    "border-destructive/40 bg-destructive/5",
                  deployment?.status &&
                    ["queued", "building", "deploying"].includes(
                      deployment.status
                    ) &&
                    "border-primary/40 bg-primary/5"
                )}
              >
                {deployment?.status &&
                  ["queued", "building", "deploying"].includes(
                    deployment.status
                  ) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                {deployment?.status === "ready" && (
                  <Cloud className="h-3.5 w-3.5 text-success" />
                )}
                <span className="font-mono text-xs uppercase">
                  {deployment?.status || "starting"}
                </span>
                {deployment?.url && (
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    <Globe className="h-3 w-3" /> Open
                  </a>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-border bg-background font-mono text-[11px] scrollbar-thin">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className="flex gap-2 border-b border-border/40 px-3 py-1"
                  >
                    <span className="text-muted-foreground/60">
                      {new Date(l.t).toLocaleTimeString()}
                    </span>
                    <span
                      className={cn(
                        "w-8 font-bold uppercase",
                        l.level === "ok" && "text-success",
                        l.level === "warn" && "text-warning",
                        l.level === "error" && "text-destructive",
                        l.level === "info" && "text-primary"
                      )}
                    >
                      {l.level}
                    </span>
                    <span>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TargetBtn({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-smooth",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-secondary/40 hover:bg-secondary"
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </button>
  );
}
