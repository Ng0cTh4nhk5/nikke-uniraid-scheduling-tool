"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { ApiMember } from "@/lib/types";

interface AuthState {
  currentMember: ApiMember | null;
  isAdmin: boolean;
  loading: boolean;
  setMember: (m: ApiMember | null) => Promise<void>;
  loginAdmin: (password: string) => Promise<boolean>;
  logoutAdmin: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentMember, setCurrentMember] = useState<ApiMember | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // M-6 fix: Validate session against server on mount
  const refreshSession = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/identify");
      if (!r.ok) {
        setCurrentMember(null);
        setIsAdmin(false);
        return;
      }
      const data = await r.json();
      if (data.member) {
        setCurrentMember(data.member);
      } else {
        setCurrentMember(null);
      }
      setIsAdmin(!!data.isAdmin);
    } catch {
      // Server unreachable — keep current state
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      await refreshSession();
      if (mounted) setLoading(false);
    };
    init();
    return () => {
      mounted = false;
    };
  }, [refreshSession]);

  // C-1 fix: Identity is set via server cookie, not client-side
  const setMember = async (m: ApiMember | null) => {
    if (m) {
      const r = await fetch("/api/auth/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id }),
      });
      if (r.ok) {
        const data = await r.json();
        setCurrentMember(data.member);
      }
    } else {
      await fetch("/api/auth/identify", { method: "DELETE" });
      setCurrentMember(null);
    }
  };

  // C-1 fix: Admin login via server-set httpOnly cookie
  const loginAdmin = async (password: string): Promise<boolean> => {
    const r = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const logoutAdmin = async () => {
    await fetch("/api/auth/admin", { method: "DELETE" });
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{ currentMember, isAdmin, loading, setMember, loginAdmin, logoutAdmin, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}
