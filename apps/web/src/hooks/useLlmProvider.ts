"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const STORAGE_KEY = "nebula_llm_provider";

export function useLlmProvider(projectId: string) {
  const [providers, setProviders] = useState<
    Array<{ id: "anthropic" | "deepseek"; label: string; default?: boolean }>
  >([]);
  const [selected, setSelectedState] = useState<"anthropic" | "deepseek" | "">(
    ""
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .listLlmProviders()
      .then((res) => {
        setProviders(res.data);
        const stored = localStorage.getItem(STORAGE_KEY) as
          | "anthropic"
          | "deepseek"
          | null;
        const valid =
          stored && res.data.some((p) => p.id === stored)
            ? stored
            : (res.data.find((p) => p.default)?.id ?? res.data[0]?.id ?? "");
        setSelectedState(valid);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const setSelected = useCallback((id: "anthropic" | "deepseek") => {
    setSelectedState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { providers, selected, setSelected, loading };
}
