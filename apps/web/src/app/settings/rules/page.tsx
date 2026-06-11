"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

export default function UserRulesSettingsPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getUserRules()
      .then((res) => setRules(res.agentRules ?? ""))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateUserRules(rules.trim() || null);
      toast({ title: "User rules saved" });
    } catch {
      toast({ title: "Failed to save rules", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [rules, toast]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">User rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account-level instructions for the AI — like Cursor user rules.
          Applied to every project, before project rules and{" "}
          <code className="text-xs">.cursor/rules/</code> files.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder={`Example:\n- Reply in English\n- Always use TypeScript strict mode\n- Prefer functional patterns`}
            rows={14}
            className="min-h-[240px] w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Project-scoped rules: workspace Rules tab or{" "}
              <code className="text-xs">.cursor/rules/*.md</code> files (with
              optional <code className="text-xs">globs:</code> frontmatter).
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save rules"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
