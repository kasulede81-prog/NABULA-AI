"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

const ToastContext = createContext<{
  toast: (item: Omit<ToastItem, "id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((item: Omit<ToastItem, "id">) => {
    const id = Date.now();
    setItems((prev) => [...prev, { ...item, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "min-w-[240px] max-w-sm rounded-lg border px-4 py-3 shadow-elegant animate-fade-in-up",
              t.variant === "destructive"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-card text-foreground"
            )}
          >
            <div className="text-sm font-medium">{t.title}</div>
            {t.description && (
              <div className="mt-1 text-xs text-muted-foreground">
                {t.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (_item: Omit<ToastItem, "id">) => undefined,
    };
  }
  return ctx;
}
