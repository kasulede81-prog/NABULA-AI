"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND_TAGLINE } from "@/lib/brand";

export default function RegisterPage() {
  const { register, error } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, name);
      router.push("/projects");
    } catch {
      // error set in hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh opacity-60" />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card/80 p-8 shadow-elegant backdrop-blur-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark compact className="mb-3" />
          <BrandMark className="text-lg" />
          <p className="mt-2 text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
        </div>
        <h1 className="mb-6 text-xl font-semibold">Create account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Register
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
