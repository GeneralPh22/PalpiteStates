import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AuthUser {
  id: number;
  email: string;
  emailVerified: boolean;
}

export interface Subscription {
  id: number;
  userId: number;
  plan: string;
  status: string;
  trialStartAt: string;
  trialEndAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export type AccessLevel = "full" | "trial" | "limited";

interface AuthState {
  user: AuthUser | null;
  subscription: Subscription | null;
  accessLevel: AccessLevel;
  loading: boolean;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    subscription: null,
    accessLevel: "limited",
    loading: true,
    token: null,
  });

  const refresh = useCallback(async () => {
    try {
      const storedToken = localStorage.getItem("ps_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

      const res = await fetch(`${BASE}/api/auth/me`, { headers, credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          user: data.user,
          subscription: data.subscription,
          accessLevel: data.accessLevel,
          loading: false,
          token: storedToken,
        }));
      } else {
        setState({ user: null, subscription: null, accessLevel: "limited", loading: false, token: null });
      }
    } catch {
      setState({ user: null, subscription: null, accessLevel: "limited", loading: false, token: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (data.token) localStorage.setItem("ps_token", data.token);
    setState((prev) => ({
      ...prev,
      user: data.user,
      subscription: data.subscription,
      accessLevel: data.accessLevel || "trial",
      token: data.token,
    }));
    await refresh();
  };

  const register = async (email: string, password: string) => {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
    if (data.token) localStorage.setItem("ps_token", data.token);
    await refresh();
  };

  const logout = async () => {
    const storedToken = localStorage.getItem("ps_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers, credentials: "include" });
    localStorage.removeItem("ps_token");
    setState({ user: null, subscription: null, accessLevel: "limited", loading: false, token: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
