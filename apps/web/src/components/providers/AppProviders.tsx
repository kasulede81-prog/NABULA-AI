"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { ToastProvider } from "@/hooks/useToast";
import { PostHogAnalytics } from "@/components/providers/PostHogAnalytics";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ToastProvider>
          <PostHogAnalytics />
          {children}
        </ToastProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
