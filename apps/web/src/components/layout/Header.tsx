"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export function Header() {
  const { user, logout } = useAuth();
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
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => clearInterval(interval);
  }, [loadNotifications, user]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border px-6">
      <Link href="/projects" className="text-lg font-bold text-white">
        Nebula <span className="text-nebula-500">AI</span>
      </Link>

      {user && (
        <div className="flex items-center gap-4">
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
