"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { hasStoredToken } from "@/lib/auth-storage";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "nebula_workspace_id";

const WORKSPACE_ROUTES = /^\/(projects|workspaces|settings)(\/|$)/;

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  membersCount: number;
  projectsCount: number;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading: authLoading, user } = useAuth();
  const needsWorkspace = WORKSPACE_ROUTES.test(pathname ?? "");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(
    readStoredWorkspaceId
  );
  const [loading, setLoading] = useState(
    () => needsWorkspace && hasStoredToken()
  );

  const refreshWorkspaces = useCallback(async () => {
    if (!api.getToken()) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.listWorkspaces();
      setWorkspaces(res.data);
      const stored = readStoredWorkspaceId();
      if (stored && res.data.some((w) => w.id === stored)) {
        setActiveWorkspaceIdState(stored);
      }
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!needsWorkspace) {
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refreshWorkspaces();
  }, [needsWorkspace, authLoading, user, refreshWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveWorkspaceIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeWorkspace =
    activeWorkspaceId
      ? workspaces.find((w) => w.id === activeWorkspaceId) ?? null
      : null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        setActiveWorkspaceId,
        refreshWorkspaces,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
