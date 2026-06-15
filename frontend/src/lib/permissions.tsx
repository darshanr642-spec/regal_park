/**
 * Role-Based Permission System — React hook + context.
 *
 * Fetches the current user's permission map from GET /api/permissions/me
 * and exposes a `can(module, action)` helper.
 *
 * Usage:
 *   const { can, perms } = usePermissions();
 *   if (can("projects", "edit")) { ... }
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

type PermMap = Record<string, Record<string, boolean>>;

interface PermCtx {
  perms: PermMap;
  can: (module: string, action: string) => boolean;
  loading: boolean;
  refresh: () => void;
}

const PermissionsContext = createContext<PermCtx>({
  perms: {},
  can: () => false,
  loading: true,
  refresh: () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [perms, setPerms] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) {
      setPerms({});
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getMyPermissions()
      .then((res: any) => {
        setPerms(res.permissions || {});
      })
      .catch(() => {
        // ADMIN fallback — always full access
        if (user.role === "ADMIN") {
          const all = { view: true, edit: true, create: true, delete: true };
          setPerms({
            users: all, projects: all, plots: all, boq: all,
            procurement: all, team: all, pricing: all, settings: all,
            audit: all, leads: all, bookings: all, profile: all,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const can = useCallback(
    (module: string, action: string): boolean => {
      // ADMIN always has full access (client-side safety net)
      if (user?.role === "ADMIN") return true;
      return perms[module]?.[action] === true;
    },
    [perms, user]
  );

  return (
    <PermissionsContext.Provider value={{ perms, can, loading, refresh: load }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

/**
 * Returns true if the user has at least one "view" permission on any module.
 * Used to decide whether to show the "Data Editor" link.
 */
export function hasAnyViewPermission(perms: PermMap): boolean {
  for (const mod of Object.values(perms)) {
    if (mod.view) return true;
  }
  return false;
}
