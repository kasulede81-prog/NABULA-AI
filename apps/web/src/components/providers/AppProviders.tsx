"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { ToastProvider } from "@/hooks/useToast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ToastProvider>{children}</ToastProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
