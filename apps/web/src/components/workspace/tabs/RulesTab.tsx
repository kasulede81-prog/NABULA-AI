"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

export function RulesTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [rules, setRules] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getProject(projectId)
      .then((p) => setRules(p.agentRules ?? ""))
      .finally(() => setLoading(false));
  }, [projectId]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateProject(projectId, {
        agentRules: rules.trim() || null,
      });
      toast({ title: "Project rules saved" });
    } catch {
      toast({ title: "Failed to save rules", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [projectId, rules, toast]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading rules…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Project rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom instructions for the AI — like Cursor rules. Applied to chat,
          builds, and AI edits.
        </p>
      </div>
      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        placeholder={`Example:\n- Always use TypeScript strict mode\n- Prefer server components in Next.js\n- Use shadcn/ui for new components`}
        rows={16}
        className="flex-1 min-h-[240px] w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary/50"
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  );
}
