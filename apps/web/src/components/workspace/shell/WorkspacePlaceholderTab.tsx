"use client";

import type { LucideIcon } from "lucide-react";

interface WorkspacePlaceholderTabProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function WorkspacePlaceholderTab({
  icon: Icon,
  title,
  description,
}: WorkspacePlaceholderTabProps) {
  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="grid flex-1 place-items-center p-8">
        <div className="max-w-sm space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
