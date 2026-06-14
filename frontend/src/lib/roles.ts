/**
 * Centralised role → route mapping and route-guard helpers.
 *
 * ── Role-Based Routing ──────────────────────────────────────────────
 * After login, each role is sent to its designated landing page.
 *
 * ── Route Guards ────────────────────────────────────────────────────
 * Every protected zone declares which roles may enter.
 * Unauthorized users are redirected to their home page.
 */

/* ── Role → Landing page ────────────────────────────────────────── */
export const ROLE_HOME: Record<string, string> = {
  ADMIN:               "/(tabs)",
  COO:                 "/coo/dashboard",
  PROJECT_DIRECTOR:    "/(tabs)",
  SALES_MANAGER:       "/crm/dashboard",
  CRM_SALES:           "/crm/leads",
  PROJECT_MANAGER:     "/(tabs)",
  ARCHITECT:           "/(tabs)",
  STRUCTURAL_ENGINEER: "/(tabs)",
  MEP_CONSULTANT:      "/(tabs)",
  INTERIOR_DESIGNER:   "/(tabs)",
  LANDSCAPE_ARCHITECT: "/(tabs)",
  PLANNING_ENGINEER:   "/(tabs)",
  QUANTITY_SURVEYOR:   "/(tabs)",
  PROCUREMENT_MANAGER: "/(tabs)",
  SITE_ENGINEER:       "/(tabs)",
  SAFETY_OFFICER:      "/(tabs)",
  STORE_KEEPER:        "/(tabs)",
  ACCOUNTANT:          "/(tabs)",
  CONTRACTOR:          "/(tabs)",
  CLIENT:              "/portal/home",
  LANDOWNER:           "/landowner/dashboard",
};

export function getHomeForRole(role: string): string {
  return ROLE_HOME[role] ?? "/(tabs)";
}

/* ── Route-zone → allowed roles ─────────────────────────────────── */

/** Internal roles that can access the main tabs and project pages. */
const INTERNAL_ROLES = new Set([
  "ADMIN", "COO", "PROJECT_DIRECTOR", "SALES_MANAGER", "CRM_SALES",
  "PROJECT_MANAGER", "ARCHITECT", "STRUCTURAL_ENGINEER", "MEP_CONSULTANT",
  "INTERIOR_DESIGNER", "LANDSCAPE_ARCHITECT", "PLANNING_ENGINEER",
  "QUANTITY_SURVEYOR", "PROCUREMENT_MANAGER", "SITE_ENGINEER",
  "SAFETY_OFFICER", "STORE_KEEPER", "ACCOUNTANT", "CONTRACTOR",
]);

const CRM_ROLES = new Set([
  "ADMIN", "CRM_SALES", "SALES_MANAGER", "PROJECT_DIRECTOR", "COO",
]);

const COO_ROLES = new Set(["ADMIN", "COO"]);

const INVENTORY_ROLES = new Set([
  "ADMIN", "COO", "SALES_MANAGER", "PROJECT_DIRECTOR",
]);

const LANDOWNER_ROLES = new Set(["ADMIN", "LANDOWNER"]);

const PORTAL_ROLES = new Set(["ADMIN", "CLIENT"]);

const APPROVAL_ROLES = new Set([
  "ADMIN", "COO", "PROJECT_DIRECTOR", "SALES_MANAGER", "PROJECT_MANAGER",
]);

const ADMIN_ROLES = new Set(["ADMIN"]);

/** All authenticated roles — for data editor (backend enforces per-module). */
const ALL_ROLES = new Set([
  "ADMIN", "COO", "PROJECT_DIRECTOR", "SALES_MANAGER", "CRM_SALES",
  "PROJECT_MANAGER", "ARCHITECT", "STRUCTURAL_ENGINEER", "MEP_CONSULTANT",
  "INTERIOR_DESIGNER", "LANDSCAPE_ARCHITECT", "PLANNING_ENGINEER",
  "QUANTITY_SURVEYOR", "PROCUREMENT_MANAGER", "SITE_ENGINEER",
  "SAFETY_OFFICER", "STORE_KEEPER", "ACCOUNTANT", "CONTRACTOR",
  "CLIENT", "LANDOWNER",
]);

/** Route prefix → allowed roles. Order matters: first match wins. */
const ZONE_GUARDS: Array<{ prefix: string; roles: Set<string> }> = [
  { prefix: "/admin/permissions", roles: ADMIN_ROLES },
  { prefix: "/admin/edit-center", roles: ALL_ROLES },
  { prefix: "/admin",             roles: ADMIN_ROLES },
  { prefix: "/crm",        roles: CRM_ROLES },
  { prefix: "/coo",        roles: COO_ROLES },
  { prefix: "/inventory",  roles: INVENTORY_ROLES },
  { prefix: "/landowner",  roles: LANDOWNER_ROLES },
  { prefix: "/portal",     roles: PORTAL_ROLES },
  { prefix: "/approvals",  roles: APPROVAL_ROLES },
  { prefix: "/(tabs)",     roles: INTERNAL_ROLES },
  { prefix: "/project",    roles: INTERNAL_ROLES },
  { prefix: "/plot",       roles: INTERNAL_ROLES },
  { prefix: "/module",     roles: INTERNAL_ROLES },
  { prefix: "/layout-plan",roles: INTERNAL_ROLES },
];

/**
 * Check if a role is allowed to access a given path.
 * Returns `true` if allowed, `false` if explicitly denied.
 * Returns `true` for unguarded paths (login, etc.).
 */
export function isRoleAllowed(role: string, path: string): boolean {
  for (const zone of ZONE_GUARDS) {
    if (path.startsWith(zone.prefix)) {
      return zone.roles.has(role);
    }
  }
  return true; // unguarded routes (login, etc.)
}

/**
 * Returns true if the given role is an "internal" team role
 * (not CLIENT, not LANDOWNER).
 */
export function isInternalRole(role: string): boolean {
  return INTERNAL_ROLES.has(role);
}
