"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";

const PROJECT_WORKSPACE = /^\/projects\/(?!new$)[^/]+$/;

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isProjectWorkspace = PROJECT_WORKSPACE.test(pathname);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (!loading && !user) {
    return null;
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (isProjectWorkspace) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
