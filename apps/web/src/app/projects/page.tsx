"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useEnterWorkspace } from "@/hooks/useEnterWorkspace";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function ProjectsPage() {
  const { loading: workspaceLoading } = useWorkspace();
  const { enterWorkspace, entering } = useEnterWorkspace();

  useEffect(() => {
    if (workspaceLoading) return;
    void enterWorkspace();
  }, [workspaceLoading, enterWorkspace]);

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 px-6">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-primary shadow-glow">
        <Sparkles className="h-5 w-5 text-primary-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {entering || workspaceLoading
          ? "Opening your workspace…"
          : "Redirecting…"}
      </p>
    </div>
  );
}
