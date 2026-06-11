"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();
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
      .then(() => router.replace("/onboarding"))
      .catch((err) => {
        setError(
          (err as { error?: { message?: string } }).error?.message ??
            "OAuth sign-in failed"
        );
      });
  }, [router]);

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
