"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function NewWorkspacePage() {
  const router = useRouter();
  const { refreshWorkspaces } = useWorkspace();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.createWorkspace(name);
      await refreshWorkspaces();
      router.push(`/workspaces/${res.data.id}`);
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ??
          "Failed to create workspace"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <Link href="/workspaces" className="text-xs text-nebula-400 hover:underline">
        ← Back to workspaces
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold text-white">Create Workspace</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Workspace Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Team"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          Create Workspace
        </Button>
      </form>
    </div>
  );
}
