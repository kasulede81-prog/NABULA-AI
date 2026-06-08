"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const workspaceId = searchParams.get("workspaceId") ?? activeWorkspaceId ?? undefined;

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          Creating in workspace: <span className="text-gray-300">{activeWorkspace.name}</span>
        </p>
      )}
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
