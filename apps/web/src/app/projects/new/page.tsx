"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PROJECT_TEMPLATES } from "@nebula/shared";
import { api } from "@/lib/api";
import { setLastProjectId } from "@/lib/workspace-entry";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const workspaceId = searchParams.get("workspaceId") ?? activeWorkspaceId ?? undefined;

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (id: string) => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSelectedTemplate(id);
    setName(t.name);
    setPrompt(t.prompt);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const project = await api.createProject(
        name || "Untitled Project",
        prompt,
        workspaceId
      );
      setLastProjectId(project.id);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ??
          "Failed to create project"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-white">New Project</h1>
      {workspaceId && activeWorkspace && (
        <p className="mb-6 text-sm text-gray-500">
          Creating in workspace:{" "}
          <span className="text-gray-300">{activeWorkspace.name}</span>
        </p>
      )}

      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-gray-300">Start from template</p>
        <div className="flex flex-wrap gap-2">
          {PROJECT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-smooth",
                selectedTemplate === t.id
                  ? "border-primary bg-primary/20 text-white"
                  : "border-surface-border text-gray-400 hover:border-gray-500"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restaurant POS"
        />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">
            Describe your app
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Build a restaurant POS with menu management, order tracking, and a simple dashboard..."
            rows={6}
            required
            className="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-nebula-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" loading={loading} disabled={!prompt.trim()}>
          Create Project
        </Button>
      </form>
    </div>
  );
}
