import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getRefreshToken, getToken, setRefreshToken, setToken } from "./api";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone?: string;
  company?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const tok = await getToken();
      if (tok) {
        try {
          const me = await api.me();
          setUser(me);
        } catch {
          // Access token expired — try refresh
          const rt = await getRefreshToken();
          if (rt) {
            try {
              const { access_token, refresh_token } = await api.refresh(rt);
              await setToken(access_token);
              await setRefreshToken(refresh_token);
              const me = await api.me();
              setUser(me);
            } catch {
              await setToken(null);
              await setRefreshToken(null);
            }
          } else {
            await setToken(null);
          }
        }
      }
    } catch {
      await setToken(null);
      await setRefreshToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token, refresh_token } = await api.login(email, password);
    await setToken(access_token);
    await setRefreshToken(refresh_token);
    const me = await api.me();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = await getRefreshToken();
      if (rt) await api.logout(rt);
    } catch {
      // Best-effort — still clear local state
    }
    await setToken(null);
    await setRefreshToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
