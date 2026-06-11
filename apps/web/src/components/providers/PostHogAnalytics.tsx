"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PostHogAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    if (!key || typeof window === "undefined") return;

    void fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "$pageview",
        properties: {
          $current_url: window.location.href,
          pathname,
        },
      }),
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
