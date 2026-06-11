"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Check,
  FolderKanban,
  LogOut,
  MessageSquare,
  Plug,
  ScrollText,
  Settings,
  User,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/workspaces", label: "Workspaces", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: Settings },
  { href: "/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/settings/rules", label: "Rules", icon: ScrollText },
  { href: "/settings/feedback", label: "Feedback", icon: MessageSquare },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    setActiveWorkspaceId,
  } = useWorkspace();
  const [teamOpen, setTeamOpen] = useState(false);

  const contextLabel = activeWorkspace?.name ?? "Personal";
  const contextRole = activeWorkspace?.role ?? "owner";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center border-b border-border px-3">
          <Link href="/projects" className="flex items-center gap-2">
            <BrandMark compact />
            <BrandMark />
          </Link>
        </div>

        <div className="relative px-3 pt-3">
          <button
            type="button"
            onClick={() => setTeamOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-left transition-smooth hover:bg-secondary"
          >
            {activeWorkspace ? (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{contextLabel}</div>
              <div className="text-[10px] capitalize text-muted-foreground">
                {contextRole}
              </div>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {teamOpen && (
            <div className="absolute left-3 right-3 top-full z-20 mt-1 animate-fade-in-up rounded-lg border border-border bg-popover py-1 shadow-elegant">
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspaceId(null);
                  setTeamOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary"
              >
                {!activeWorkspaceId ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <span className="w-3" />
                )}
                Personal
              </button>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setTeamOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary"
                >
                  {activeWorkspaceId === ws.id ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : (
                    <span className="w-3" />
                  )}
                  {ws.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/projects" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-smooth",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-border p-3">
            <div className="mb-2 truncate text-xs text-muted-foreground">
              {user.name}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
