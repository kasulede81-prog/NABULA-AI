import { Sparkles } from "lucide-react";
import { BRAND_SHORT } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandMark({ compact, className }: BrandMarkProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow",
          className
        )}
      >
        <Sparkles
          className="h-4 w-4 text-primary-foreground"
          strokeWidth={2.5}
        />
      </div>
    );
  }

  return (
    <span className={cn("text-sm font-semibold tracking-tight", className)}>
      {BRAND_SHORT} <span className="text-gradient font-normal">dev</span>
    </span>
  );
}

export function BrandTitle({ className }: { className?: string }) {
  return (
    <span className={className}>
      {BRAND_SHORT} <span className="text-gradient">dev</span>
    </span>
  );
}

export function BrandHero({ className }: { className?: string }) {
  return (
    <h1 className={cn("font-bold text-white", className)}>
      {BRAND_SHORT} <span className="text-nebula-500">dev</span>
    </h1>
  );
}
