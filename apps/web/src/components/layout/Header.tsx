"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";

export function Header() {
  const { user, logout } = useAuth();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
  } = useWorkspace();
  const [unreadSupport, setUnreadSupport] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!api.getToken()) return;
    try {
      const res = await api.getSupportNotifications();
      setUnreadSupport(res.data.unreadMessages);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => clearInterval(interval);
  }, [loadNotifications, user?.id]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border px-6">
      <Link href="/projects" className="text-lg font-bold text-white">
        Nebula <span className="text-nebula-500">AI</span>
      </Link>

      {user && (
        <div className="flex items-center gap-4">
          <select
            value={activeWorkspaceId ?? "personal"}
            onChange={(e) =>
              setActiveWorkspaceId(
                e.target.value === "personal" ? null : e.target.value
              )
            }
            className="rounded-md border border-surface-border bg-surface px-2 py-1 text-xs text-gray-300"
          >
            <option value="personal">Personal</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <Link
            href="/workspaces"
            className="text-xs text-gray-500 hover:text-nebula-400"
          >
            Workspaces
          </Link>
          {user.subscription && (
            <Link
              href="/settings/billing"
              className="text-xs text-gray-500 hover:text-nebula-400"
            >
              {user.subscription.plan} ·{" "}
              {user.subscription.creditsRemaining !== undefined
                ? `${user.subscription.creditsRemaining} credits`
                : `${user.subscription.buildsUsed}/${user.subscription.buildsLimit} AI`}
              {unreadSupport > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {unreadSupport}
                </span>
              )}
            </Link>
          )}
          <Link
            href="/settings/feedback"
            className="text-xs text-gray-500 hover:text-nebula-400"
          >
            Feedback
          </Link>
          <span className="text-sm text-gray-400">{user.name}</span>
          <Button variant="ghost" onClick={() => logout()}>
            Logout
          </Button>
        </div>
      )}
    </header>
  );
}
