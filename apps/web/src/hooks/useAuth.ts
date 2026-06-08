"use client";

import { useCallback, useEffect, useState } from "react";
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    refresh();
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

  return { user, loading, error, register, login, logout, refresh };
}
