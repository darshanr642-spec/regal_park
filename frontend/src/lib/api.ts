import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "rpv_token";

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, "")) || null;
}

export async function setToken(t: string | null) {
  if (!t) await storage.secureRemove(TOKEN_KEY);
  else await storage.secureSet(TOKEN_KEY, t);
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
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

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
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
  createReport: (body: any) =>
    request<any>("/site-reports", { method: "POST", body }),
  patchStage: (id: string, body: any) =>
    request<any>(`/stages/${id}`, { method: "PATCH", body }),
  patchQuality: (id: string, body: any) =>
    request<any>(`/quality/${id}`, { method: "PATCH", body }),
  patchSnag: (id: string, body: any) =>
    request<any>(`/snags/${id}`, { method: "PATCH", body }),
};
