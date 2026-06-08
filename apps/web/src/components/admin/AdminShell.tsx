"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/builds", label: "Builds" },
  { href: "/admin/ai", label: "AI Usage" },
  { href: "/admin/previews", label: "Previews" },
  { href: "/admin/github", label: "GitHub" },
  { href: "/admin/billing", label: "Billing", badgeKey: "upgrades" as const },
  { href: "/admin/support", label: "Support", badgeKey: "messages" as const },
  { href: "/admin/system", label: "System" },
  { href: "/admin/errors", label: "Errors" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [notifications, setNotifications] = useState({
    unreadMessages: 0,
    pendingUpgrades: 0,
  });

  const checkAccess = useCallback(async () => {
    try {
      const res = await api.getAdminMe();
      if (!res.data.isAdmin) {
        setDenied(true);
        return;
      }
      setAdminEmail(res.data.email);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.getAdminSupportNotifications();
      setNotifications(res.data);
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (denied || loading) return;
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 30_000);
    return () => clearInterval(interval);
  }, [denied, loading, loadNotifications]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-gray-400">
        Verifying admin access...
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <h1 className="text-xl font-semibold text-white">Access Denied</h1>
        <p className="max-w-md text-sm text-gray-400">
          Admin access is required. Your account is not in the ADMIN_EMAILS allowlist.
        </p>
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="rounded-md bg-nebula-600 px-4 py-2 text-sm text-white hover:bg-nebula-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const badgeCount = (key: "messages" | "upgrades") =>
    key === "messages"
      ? notifications.unreadMessages
      : notifications.pendingUpgrades;

  const navLink = (item: (typeof NAV)[number], mobile = false) => {
    const active = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);
    const count = item.badgeKey ? badgeCount(item.badgeKey) : 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`${mobile ? "shrink-0" : ""} relative rounded px-2.5 py-1 text-xs ${
          active
            ? "bg-nebula-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        {item.label}
        {count > 0 && (
          <span className="ml-1 inline-flex min-w-[16px] justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-surface-border bg-surface-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-semibold text-white">
              Nebula Admin
            </Link>
            <nav className="hidden gap-1 md:flex">
              {NAV.map((item) => navLink(item))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {(notifications.unreadMessages > 0 ||
              notifications.pendingUpgrades > 0) && (
              <span className="text-amber-400">
                {notifications.pendingUpgrades > 0 &&
                  `${notifications.pendingUpgrades} upgrades`}
                {notifications.pendingUpgrades > 0 &&
                  notifications.unreadMessages > 0 &&
                  " · "}
                {notifications.unreadMessages > 0 &&
                  `${notifications.unreadMessages} unread`}
              </span>
            )}
            {adminEmail && <span>{adminEmail}</span>}
            <Link href="/projects" className="text-nebula-400 hover:underline">
              Exit
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-surface-border px-4 py-2 md:hidden">
          {NAV.map((item) => navLink(item, true))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
