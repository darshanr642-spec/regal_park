import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "rpv_token";
const REFRESH_KEY = "rpv_refresh_token";

let cachedToken: string | null = null;
let cachedRefresh: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = (await storage.secureGet<string>(TOKEN_KEY, "")) || null;
  return cachedToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (cachedRefresh) return cachedRefresh;
  cachedRefresh = (await storage.secureGet<string>(REFRESH_KEY, "")) || null;
  return cachedRefresh;
}

export async function setToken(t: string | null) {
  cachedToken = t;
  if (!t) await storage.secureRemove(TOKEN_KEY);
  else await storage.secureSet(TOKEN_KEY, t);
}

export async function setRefreshToken(t: string | null) {
  cachedRefresh = t;
  if (!t) await storage.secureRemove(REFRESH_KEY);
  else await storage.secureSet(REFRESH_KEY, t);
}

/**
 * Resolve a stored file path ("/api/files/{id}") into a fetchable URL,
 * appending the auth token as a query param (Image tags can't send headers on web).
 * Legacy base64 data URIs and absolute URLs pass through untouched.
 */
export function fileUri(p?: string | null): string {
  if (!p) return "";
  if (p.startsWith("data:") || p.startsWith("http")) return p;
  const sep = p.includes("?") ? "&" : "?";
  return `${BASE}${p}${sep}token=${cachedToken || ""}`;
}

/** Try to refresh the access token using the stored refresh token. */
async function tryRefreshAccessToken(): Promise<boolean> {
  const rt = await getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await setToken(data.access_token);
    await setRefreshToken(data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; _retried?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true, _retried = false } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const tok = await getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401 (CRIT-2)
  if (res.status === 401 && auth && !_retried) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...opts, _retried: true });
    }
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

/** Multipart upload to GridFS-backed storage. Returns { id, url } where url = /api/files/{id}. */
export async function uploadFile(form: FormData): Promise<{ id: string; url: string; content_type: string; size: number }> {
  const tok = await getToken();
  const res = await fetch(`${BASE}/api/files`, {
    method: "POST",
    headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  refresh: (refresh_token: string) =>
    request<{ access_token: string; refresh_token: string }>("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
      auth: false,
    }),
  logout: (refresh_token: string) =>
    request<{ revoked: boolean }>("/auth/logout", {
      method: "POST",
      body: { refresh_token },
      auth: false,
    }),
  me: () => request<any>("/auth/me"),
  users: () => request<any[]>("/auth/users"),
  projects: () => request<any[]>("/projects"),
  project: (id: string) => request<any>(`/projects/${id}`),
  dashboard: () => request<any>("/dashboard/summary"),
  stages: (projectId?: string) =>
    request<any[]>(`/stages${projectId ? `?project_id=${projectId}` : ""}`),
  boq: (projectId?: string) =>
    request<any[]>(`/boq${projectId ? `?project_id=${projectId}` : ""}`),
  materials: (projectId?: string) =>
    request<any[]>(`/materials${projectId ? `?project_id=${projectId}` : ""}`),
  reports: (projectId?: string) =>
    request<any[]>(`/site-reports${projectId ? `?project_id=${projectId}` : ""}`),
  billing: (projectId?: string) =>
    request<any[]>(`/billing${projectId ? `?project_id=${projectId}` : ""}`),
  quality: (projectId?: string) =>
    request<any[]>(`/quality${projectId ? `?project_id=${projectId}` : ""}`),
  snags: (projectId?: string) =>
    request<any[]>(`/snags${projectId ? `?project_id=${projectId}` : ""}`),
  team: (projectId?: string) =>
    request<any[]>(`/team${projectId ? `?project_id=${projectId}` : ""}`),
  approvals: (projectId?: string) =>
    request<any[]>(`/approvals${projectId ? `?project_id=${projectId}` : ""}`),
  documents: (projectId?: string, limit = 20, skip = 0) =>
    request<{ items: any[]; total: number; limit: number; skip: number; has_more: boolean }>(
      `/documents?${projectId ? `project_id=${projectId}&` : ""}limit=${limit}&skip=${skip}`,
    ),
  createDocument: (body: any) =>
    request<any>("/documents", { method: "POST", body }),
  deleteDocument: (id: string) =>
    request<any>(`/documents/${id}`, { method: "DELETE" }),
  createReport: (body: any) =>
    request<any>("/site-reports", { method: "POST", body }),
  patchStage: (id: string, body: any) =>
    request<any>(`/stages/${id}`, { method: "PATCH", body }),
  patchQuality: (id: string, body: any) =>
    request<any>(`/quality/${id}`, { method: "PATCH", body }),
  patchSnag: (id: string, body: any) =>
    request<any>(`/snags/${id}`, { method: "PATCH", body }),

  // Procurement — purchase orders
  purchaseOrders: (projectId?: string) =>
    request<any[]>(`/purchase-orders${projectId ? `?project_id=${projectId}` : ""}`),
  createPurchaseOrder: (body: any) =>
    request<any>("/purchase-orders", { method: "POST", body }),
  transitionPurchaseOrder: (id: string, action: string, note?: string) =>
    request<any>(`/purchase-orders/${id}/transition`, { method: "PATCH", body: { action, note } }),

  // Approval workflow
  approvalRequests: (projectId?: string) =>
    request<any[]>(`/approval-requests${projectId ? `?project_id=${projectId}` : ""}`),
  createApprovalRequest: (body: any) =>
    request<any>("/approval-requests", { method: "POST", body }),
  decideApprovalRequest: (id: string, decision: string, note?: string) =>
    request<any>(`/approval-requests/${id}/decide`, { method: "PATCH", body: { decision, note } }),

  // Stage quality checklists
  checklistTemplates: () => request<any[]>("/checklist-templates"),
  stageChecklists: (projectId?: string) =>
    request<any[]>(`/stage-checklists${projectId ? `?project_id=${projectId}` : ""}`),
  createStageChecklist: (body: { project_id: string; stage_name: string }) =>
    request<any>("/stage-checklists", { method: "POST", body }),
  patchChecklistItem: (cid: string, itemId: string, body: { status: string; remarks?: string }) =>
    request<any>(`/stage-checklists/${cid}/items/${itemId}`, { method: "PATCH", body }),
  signOffChecklist: (cid: string) =>
    request<any>(`/stage-checklists/${cid}/sign-off`, { method: "POST" }),

  // Layout plan plots
  plots: () => request<any[]>("/plots"),
  plot: (plotNo: number) => request<any>(`/plots/${plotNo}`),

  // CRM — Pricing
  crmPricing: () => request<any[]>("/crm/pricing"),
  crmUpsertPricing: (body: any) =>
    request<any>("/crm/pricing", { method: "PUT", body }),

  // CRM — Leads
  crmLeads: (params?: Record<string, string>) => {
    const qs = params
      ? "?" + Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&")
      : "";
    return request<any[]>(`/crm/leads${qs}`);
  },
  crmLead: (id: string) => request<any>(`/crm/leads/${id}`),
  crmCreateLead: (body: any) =>
    request<any>("/crm/leads", { method: "POST", body }),
  crmUpdateLead: (id: string, body: any) =>
    request<any>(`/crm/leads/${id}`, { method: "PATCH", body }),
  crmLeadTimeline: (id: string) =>
    request<any[]>(`/crm/leads/${id}/timeline`),

  // CRM — Site Visits
  crmSiteVisits: (leadId?: string) =>
    request<any[]>(`/crm/site-visits${leadId ? `?lead_id=${leadId}` : ""}`),
  crmCreateSiteVisit: (body: any) =>
    request<any>("/crm/site-visits", { method: "POST", body }),
  crmUpdateSiteVisit: (id: string, body: any) =>
    request<any>(`/crm/site-visits/${id}`, { method: "PATCH", body }),

  // CRM — Quotations
  crmQuotations: (leadId?: string) =>
    request<any[]>(`/crm/quotations${leadId ? `?lead_id=${leadId}` : ""}`),
  crmCreateQuotation: (body: any) =>
    request<any>("/crm/quotations", { method: "POST", body }),
  crmQuotationPdfUrl: async (quoteId: string) => {
    const token = await getToken();
    return `${BASE}/api/crm/quotations/${quoteId}/pdf?token=${token}`;
  },

  // CRM — Bookings
  crmBookings: (status?: string) =>
    request<any[]>(`/crm/bookings${status ? `?status=${status}` : ""}`),
  crmBooking: (id: string) => request<any>(`/crm/bookings/${id}`),
  crmCreateBooking: (body: any) =>
    request<any>("/crm/bookings", { method: "POST", body }),
  crmUpdateBooking: (id: string, body: any) =>
    request<any>(`/crm/bookings/${id}`, { method: "PATCH", body }),
  convertBooking: (id: string) =>
    request<any>(`/crm/bookings/${id}/convert`, { method: "POST" }),

  // CRM — Dashboard
  crmDashboard: () => request<any>("/crm/dashboard"),

  // CRM — Inventory
  crmInventory: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/crm/inventory${qs}`);
  },
  crmReservePlot: (plotNo: number) =>
    request<any>(`/crm/inventory/${plotNo}/reserve`, { method: "PATCH" }),
  crmReleasePlot: (plotNo: number) =>
    request<any>(`/crm/inventory/${plotNo}/release`, { method: "PATCH" }),

  // CRM — Booking Approvals
  bookingApprovals: (status?: string) =>
    request<any[]>(`/crm/booking-approvals${status ? `?status=${status}` : ""}`),
  bookingApproval: (id: string) =>
    request<any>(`/crm/booking-approvals/${id}`),
  decideBookingApproval: (id: string, body: { decision: string; note?: string }) =>
    request<any>(`/crm/booking-approvals/${id}/decide`, { method: "POST", body }),

  // CRM — Discount Requests
  discountRequests: (status?: string) =>
    request<any[]>(`/crm/discount-requests${status ? `?status=${status}` : ""}`),
  discountRequest: (id: string) =>
    request<any>(`/crm/discount-requests/${id}`),
  decideDiscountRequest: (id: string, body: { decision: string; note?: string; counter_pct?: number }) =>
    request<any>(`/crm/discount-requests/${id}/decide`, { method: "POST", body }),

  // Portal (Client-facing)
  portalDashboard: () => request<any>("/portal/dashboard"),
  portalTimeline: () => request<any>("/portal/timeline"),
  portalPayments: () => request<any>("/portal/payments"),

  // COO Dashboard
  cooPortfolio: () => request<any>("/coo/portfolio"),
  cooProjectsHealth: () => request<any[]>("/coo/projects-health"),
  cooRiskRegister: () => request<any>("/coo/risk-register"),
  cooCommandCenter: () => request<any>("/coo/command-center"),

  // Inventory Command Center
  inventoryCommandCenter: () => request<any>("/inventory/command-center"),

  // Landowner Dashboard
  landownerDashboard: () => request<any>("/landowner/dashboard"),

  // ── Admin Edit Center ─────────────────────────────────────────────
  adminSummary: () => request<any>("/admin/summary"),
  adminUsers: () => request<any[]>("/admin/users"),
  adminPatchUser: (id: string, body: any) =>
    request<any>(`/admin/users/${id}`, { method: "PATCH", body }),
  adminResetPassword: (id: string, body: { temp_password: string }) =>
    request<any>(`/admin/users/${id}/reset-password`, { method: "POST", body }),
  adminProjects: () => request<any[]>("/admin/projects"),
  adminPatchProject: (id: string, body: any) =>
    request<any>(`/admin/projects/${id}`, { method: "PATCH", body }),
  adminPlots: () => request<any[]>("/admin/plots"),
  adminPatchPlot: (plotNo: number, body: any) =>
    request<any>(`/admin/plots/${plotNo}`, { method: "PATCH", body }),
  adminImportPlots: (plots: any[]) =>
    request<any>("/admin/plots/import", { method: "POST", body: { plots } }),
  adminBoq: () => request<any[]>("/admin/boq"),
  adminCreateBoq: (body: any) =>
    request<any>("/admin/boq", { method: "POST", body }),
  adminPatchBoq: (id: string, body: any) =>
    request<any>(`/admin/boq/${id}`, { method: "PATCH", body }),
  adminDeleteBoq: (id: string) =>
    request<any>(`/admin/boq/${id}`, { method: "DELETE" }),
  adminProcurement: () => request<any[]>("/admin/procurement"),
  adminPatchProcurement: (id: string, body: any) =>
    request<any>(`/admin/procurement/${id}`, { method: "PATCH", body }),
  adminTeam: () => request<any[]>("/admin/team"),
  adminCreateTeam: (body: any) =>
    request<any>("/admin/team", { method: "POST", body }),
  adminPatchTeam: (id: string, body: any) =>
    request<any>(`/admin/team/${id}`, { method: "PATCH", body }),
  adminPricing: () => request<any[]>("/admin/pricing"),
  adminPatchPricing: (id: string, body: any) =>
    request<any>(`/admin/pricing/${id}`, { method: "PATCH", body }),
  adminSettings: () => request<any>("/admin/settings"),
  adminPatchSettings: (body: any) =>
    request<any>("/admin/settings", { method: "PATCH", body }),
  adminAuditLog: () => request<any[]>("/admin/audit-log"),

  // ── Permissions ───────────────────────────────────────────────────
  getMyPermissions: () => request<any>("/permissions/me"),
  getPermissionMatrix: () => request<any>("/permissions/matrix"),
  patchRolePermissions: (role: string, permissions: any) =>
    request<any>(`/permissions/${role}`, { method: "PATCH", body: { permissions } }),
  resetPermissions: () => request<any>("/permissions/reset", { method: "POST" }),
};

export async function downloadReportPdf(kind: string, projectId: string): Promise<Blob> {
  const tok = await getToken();
  const res = await fetch(`${BASE}/api/reports/${kind}?project_id=${projectId}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!res.ok) throw new Error(`PDF ${res.status}`);
  return res.blob();
}

export { BASE as API_BASE };
