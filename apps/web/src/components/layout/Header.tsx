"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border px-6">
      <Link href="/projects" className="text-lg font-bold text-white">
        Nebula <span className="text-nebula-500">AI</span>
      </Link>

      {user && (
        <div className="flex items-center gap-4">
          {user.subscription && (
            <span className="text-xs text-gray-500">
              {user.subscription.buildsUsed}/{user.subscription.buildsLimit} builds
            </span>
          )}
          <span className="text-sm text-gray-400">{user.name}</span>
          <Button variant="ghost" onClick={() => logout()}>
            Logout
          </Button>
        </div>
      )}
    </header>
  );
}
