import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { storage } from "@/src/utils/storage";

const KEY = "rpv_project_id";

type ProjectCtx = {
  projects: any[];
  current: any | null;
  setCurrent: (p: any) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [current, setCurrentState] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.projects();
      setProjects(list);
      const savedId = await storage.getItem<string>(KEY, "");
      const found = list.find((p) => p.id === savedId) || list[0] || null;
      setCurrentState(found);
    } catch {
      setProjects([]);
      setCurrentState(null);
    }
  }, []);

  // Re-fetch whenever the authenticated user changes (login/logout) so the
  // bearer token is in place before requesting projects.
  useEffect(() => {
    if (user) refresh();
    else { setProjects([]); setCurrentState(null); }
  }, [user, refresh]);

  const setCurrent = (p: any) => {
    setCurrentState(p);
    storage.setItem(KEY, p?.id || "");
  };

  return <Ctx.Provider value={{ projects, current, setCurrent, refresh }}>{children}</Ctx.Provider>;
}

export function useProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject outside provider");
  return v;
}
