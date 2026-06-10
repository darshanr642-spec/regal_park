# Regal Park Villas — PRD

## Overview
Premium turnkey construction-management mobile app (Expo + FastAPI + MongoDB) for managing ₹4 Cr+ luxury villa projects across the full lifecycle.

## Stack
- Frontend: Expo SDK 54, expo-router, expo-image, expo-image-picker, expo-document-picker, expo-file-system, expo-sharing, Feather icons
- Backend: FastAPI, Motor (MongoDB async), bcrypt + JWT (HS256, 7-day), reportlab for PDFs
- Auth: Email/password JWT with **server-side RBAC** for 18 roles

## Implemented Modules (v1.1)
1. **Auth** — JWT login with seeded demo accounts. JWT_SECRET strictly env-only.
2. **Dashboard** — Hero villa, project switcher chips, 6 KPIs, recent stage activity. Hidden from CLIENT (403).
3. **Projects (multi-project)** — 3 villas seeded: Villa Aurelia (46%), Villa Celeste (22%), Villa Meridian (8%). Project selector persisted via AsyncStorage.
4. **Project detail** — Sticky tabs (Timeline 23-stage stepper / Team / BOQ).
5. **Site Operations** — Daily Logs (with **photo upload** via expo-image-picker), Quality Checklist (toggle PASS/FAIL/PENDING), Snags (cycle status + **attach photos**).
6. **Module screens** — BOQ & Cost Control, Procurement, Contractor Billing, Team, Approvals, Documents & Drawings (upload/open/delete), PDF Reports (progress/cost/delay/safety), Client Portal stage view.
7. **Profile** — Role-aware menu, sign out.

## Server-side RBAC
- **CLIENT** is blocked (403) from: `/dashboard/summary`, `/boq`, `/materials`, `/billing`.
- Stage/Quality/Snag mutations gated to specific role groups (ADMIN/PM/SE/QS/SAFETY).
- Document upload + delete restricted to internal roles.
- PDF reports endpoint restricted to internal roles.

## File uploads (base64)
- `DailySiteReport.photos`, `Snag.photos`, and the `Document` collection store base64 data URIs in MongoDB.
- Web uses File picker → data URI; native uses expo-image-picker / expo-document-picker → readAsStringAsync (legacy API).

## PDF Reports
Endpoint: `GET /api/reports/{progress|cost|delay|safety}?project_id=...` (internal only)
Generated with reportlab using brand palette (charcoal+gold). Mobile downloads via expo-file-system + expo-sharing; web opens in new tab.

## Seeded sample data
- 3 villas · 47 stages · 20 BOQ items · 12 materials · 6 contractor bills · 9 quality checks · 8 snags · 12 team members · 8 approvals · 5 daily reports · 5 documents
- Primary: Villa Aurelia ₹4 Cr · Spent ₹1.85 Cr · 46%

## Smart business enhancement
**Client Portal cost-redaction enforced server-side**: clients see live progress, stages, photos and approvals but the server returns 403 for all cost/billing/materials endpoints. Developers can confidently invite owners without exposing margins.

## Demo credentials
See `/app/memory/test_credentials.md`. Primary admin: `admin@regalpark.com` / `Admin@123`.
