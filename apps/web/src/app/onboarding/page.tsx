"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_TEMPLATES } from "@nebula/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { setLastProjectId } from "@/lib/workspace-entry";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(PROJECT_TEMPLATES[0]?.id ?? "crm");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  const finish = async () => {
    const template = PROJECT_TEMPLATES.find((t) => t.id === selected);
    if (!template) return;
    setCreating(true);
    setError(null);
    try {
      const project = await api.createProject(template.name, template.prompt);
      setLastProjectId(project.id);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ??
          "Failed to create project"
      );
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {user.name}</h1>
            <p className="mt-2 text-muted-foreground">
              Pick a starter template to generate your first app in minutes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`rounded-lg border p-4 text-left transition-smooth ${
                  selected === t.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-secondary/40"
                }`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.description}
                </div>
              </button>
            ))}
          </div>
          <Button onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Ready to build?</h2>
          <p className="text-sm text-muted-foreground">
            Nebula will clarify requirements, generate files, and provision a live
            preview automatically.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button loading={creating} onClick={() => void finish()}>
              Create project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
