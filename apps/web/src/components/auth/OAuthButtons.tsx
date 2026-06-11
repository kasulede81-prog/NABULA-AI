"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export function OAuthButtons() {
  const [urls, setUrls] = useState<{ google: string | null; github: string | null }>({
    google: null,
    github: null,
  });

  useEffect(() => {
    void api.getOAuthConfig().then((res) => setUrls(res.data));
  }, []);

  if (!urls.google && !urls.github) return null;

  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">Or continue with</p>
      <div className="flex flex-col gap-2">
        {urls.google && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.location.href = urls.google!;
            }}
          >
            Google
          </Button>
        )}
        {urls.github && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.location.href = urls.github!;
            }}
          >
            GitHub
          </Button>
        )}
      </div>
    </div>
  );
}
