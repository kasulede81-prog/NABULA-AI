"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    if (!accessToken) {
      setError("Missing access token from OAuth provider");
      return;
    }

    void api
      .exchangeSupabaseToken(accessToken)
      .then(async (result) => {
        // Persist the session like email login does — without this the
        // AuthProvider never sees the user and onboarding bounces to /login.
        api.setToken(result.token);
        await refresh();
        router.replace("/onboarding");
      })
      .catch((err) => {
        setError(
          (err as { error?: { message?: string } }).error?.message ??
            "OAuth sign-in failed"
        );
      });
  }, [router, refresh]);

  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      {error ? (
        <div>
          <p className="text-destructive">{error}</p>
          <button
            type="button"
            className="mt-4 text-sm text-primary underline"
            onClick={() => router.push("/login")}
          >
            Back to login
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground">Completing sign-in…</p>
      )}
    </div>
  );
}
