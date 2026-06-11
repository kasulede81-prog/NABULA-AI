"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type ApiError } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  subscription: {
    plan: string;
    buildsUsed: number;
    buildsLimit: number;
    creditsRemaining?: number;
    status?: string;
  } | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  register: (email: string, password: string, name: string) => Promise<unknown>;
  login: (email: string, password: string) => Promise<unknown>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return "Cannot reach API server. Check NEXT_PUBLIC_API_URL (or API_PUBLIC_URL on Vercel).";
  }
  const apiErr = err as ApiError;
  if (apiErr?.error?.message) {
    if (apiErr.error.code === "HTTP_ERROR" && apiErr.error.message.includes("404")) {
      return "API not found (404). On Vercel set API_PUBLIC_URL to your Railway public URL, or set NEXT_PUBLIC_API_URL=https://YOUR-SERVICE.up.railway.app/v1";
    }
    return apiErr.error.message;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const run = (async () => {
      try {
        const me = await api.me();
        setUser(me);
        setError(null);
      } catch {
        api.setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlight.current = run;
    try {
      await run;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = async (email: string, password: string, name: string) => {
    setError(null);
    try {
      const result = await api.register(email, password, name);
      api.setToken(result.token);
      await refresh();
      return result;
    } catch (err) {
      setError(getAuthErrorMessage(err, "Registration failed"));
      throw err;
    }
  };

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const result = await api.login(email, password);
      api.setToken(result.token);
      await refresh();
      return result;
    } catch (err) {
      setError(getAuthErrorMessage(err, "Login failed"));
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, error, register, login, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
