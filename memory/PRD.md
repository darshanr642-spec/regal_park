# Regal Park Villas — PRD

## Brand
- Parent company: **Sterlitee Developers LLP**
- App: **Regal Park Villas**
- Bundle ID: `com.sterlitee.regalparkvillas`

## Overview
Premium turnkey construction-management mobile app (Expo + FastAPI + MongoDB) for managing ₹4 Cr+ luxury villa projects across the full lifecycle.

## Stack
- Frontend: Expo SDK 54, expo-router, expo-image, expo-image-picker, **expo-image-manipulator**, expo-document-picker, expo-file-system/legacy, expo-sharing, Feather icons
- Backend: FastAPI, Motor (MongoDB async), bcrypt + JWT (HS256, 7-day, env-only secret), reportlab for PDFs
- Auth: Email/password JWT with **server-side RBAC** for 18 roles

## Modules (v1.2)
1. **Auth** — JWT login with seeded demo accounts.
2. **Dashboard** — Hero villa, project switcher, 6 KPIs, recent stage activity. Hidden from CLIENT (403).
3. **Projects (multi-project)** — 3 villas seeded (Aurelia, Celeste, Meridian). Persisted selection.
4. **Project detail** — Sticky tabs (Timeline 23-stage stepper / Team / BOQ).
5. **Site Operations** — Daily Logs (with photo upload + lightbox), Quality Checklist (toggle), Snags (toggle + attach photos with lightbox).
6. **Module screens** — BOQ, Procurement, Billing, Team (PII-scrubbed for clients), Approvals, **Documents (paginated, upload/open/delete)**, **PDF Reports** (progress/cost/delay/safety branded "Sterlitee Developers LLP · Regal Park Villas"), Client Portal stage view.
7. **Profile** — Role-aware menu, sign out, Sterlitee brand footer.

## Server-side RBAC
- **CLIENT** is blocked (403) from: `/dashboard/summary`, `/boq`, `/materials`, `/billing`, `/reports/*`, all PATCH/POST mutations.
- **CLIENT** sees `/team` with phone & email scrubbed to `—` (server-side, cannot be bypassed).
- Stage/Quality/Snag mutations gated to specific role groups (ADMIN/PM/SE/QS/SAFETY).

## Photos & Files (base64)
- `pickImage()` uses **expo-image-manipulator** to resize ≤1280px wide and JPEG quality 0.6 before encoding.
- `DailySiteReport.photos`, `Snag.photos` and `Document.file_data` stored as base64 data URIs in MongoDB.
- **PhotoLightbox** modal opens any thumbnail full-screen; native pinch-zoom up to 4×.

## Pagination
- `GET /api/documents?limit=20&skip=0` → `{items, total, limit, skip, has_more}`. Frontend has "LOAD MORE" button.

## PDF Reports (reportlab, internal-only)
`GET /api/reports/{progress|cost|delay|safety}?project_id=...` — branded charcoal+gold PDFs.

## Demo credentials
See `/app/memory/test_credentials.md`. Primary admin: `admin@regalpark.com` / `Admin@123`.

## Smart business enhancement
**Defensible client onboarding** — CLIENT role gets a transparency portal that exposes progress, stages, quality, snags, approvals, documents, and team scope of work — but the server enforces zero leakage of contractor phones/emails, costs, billing, materials, margins, or PDF reports. This is a one-click upsell ("Invite owner to portal") with no risk to vendor relationships or developer profitability.
