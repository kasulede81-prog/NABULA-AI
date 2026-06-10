"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useEnterWorkspace } from "@/hooks/useEnterWorkspace";
import { Button } from "@/components/ui/Button";
import { BrandHero } from "@/components/brand/BrandMark";
import { BRAND_TAGLINE } from "@/lib/brand";

export default function HomePage() {
  const { user, loading } = useAuth();
  const { enterWorkspace } = useEnterWorkspace();

  useEffect(() => {
    if (!loading && user) void enterWorkspace();
  }, [user, loading, enterWorkspace]);

  if (loading) {
    return null;
  }

  if (user) {
    return null;
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh opacity-60" />
      <div className="relative flex flex-col items-center">
        <BrandHero className="mb-4 text-5xl" />
        <p className="mb-8 max-w-md text-center text-muted-foreground">
          {BRAND_TAGLINE}
        </p>
        <div className="flex gap-4">
          <Link href="/register">
            <Button>Get Started</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
