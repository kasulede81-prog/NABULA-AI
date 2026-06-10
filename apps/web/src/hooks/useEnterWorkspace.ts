"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveWorkspaceEntryPath } from "@/lib/workspace-entry";

export function useEnterWorkspace() {
  const router = useRouter();
  const [entering, setEntering] = useState(false);

  const enterWorkspace = useCallback(
    async (workspaceId?: string | null) => {
      setEntering(true);
      try {
        const path = await resolveWorkspaceEntryPath(workspaceId);
        router.replace(path);
      } catch {
        router.replace("/projects/new");
      } finally {
        setEntering(false);
      }
    },
    [router]
  );

  return { enterWorkspace, entering };
}
