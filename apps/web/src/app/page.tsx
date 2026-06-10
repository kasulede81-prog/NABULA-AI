"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { BrandHero } from "@/components/brand/BrandMark";
import { BRAND_TAGLINE } from "@/lib/brand";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/projects");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <BrandHero className="mb-4 text-5xl" />
      <p className="mb-8 max-w-md text-center text-gray-400">{BRAND_TAGLINE}</p>
      <div className="flex gap-4">
        <Link href="/register">
          <Button>Get Started</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Login</Button>
        </Link>
      </div>
    </div>
  );
}
