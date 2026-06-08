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
      const token = api.getToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

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
      const msg = (err as ApiError).error?.message ?? "Registration failed";
      setError(msg);
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
      const msg = (err as ApiError).error?.message ?? "Login failed";
      setError(msg);
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
