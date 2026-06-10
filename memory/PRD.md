# Regal Park Villas — PRD

## Overview
Premium turnkey construction-management mobile app (Expo + FastAPI + MongoDB) for managing ₹4 Cr luxury villa projects across the full lifecycle.

## Stack
- Frontend: Expo SDK 54, expo-router, expo-image, expo-linear-gradient, Feather icons
- Backend: FastAPI, Motor (MongoDB async), bcrypt + JWT (HS256, 7-day)
- Auth: Email/password JWT, role-based for 18 roles

## Implemented Modules (MVP v1)
1. **Auth** — JWT login with seeded demo accounts for each role
2. **Dashboard** — Hero villa card, 6 KPIs (active villas, progress, budget used, delayed tasks, pending bills, snags), recent stage activity
3. **Projects** — Project list w/ progress rings; detail screen w/ Timeline (23 stages, vertical stepper), Team, BOQ
4. **Site Operations** — Daily Logs (with new report form), Quality Checklist (tap to toggle PASS/FAIL/PENDING), Snags (tap to advance status)
5. **Module screens** — BOQ & Cost Control, Procurement, Contractor Billing, Team, Approvals, Client Portal (cost-redacted stage view)
6. **Profile** — Role-aware menu, sign out

## Seeded sample data — Villa Aurelia (Plot 12, Regal Park)
- 1 project · 23 stages · 20 BOQ items · 12 materials · 6 contractor bills
- 9 quality checks · 8 snags · 12 team members · 8 approvals · 5 daily reports
- Budget ₹4 Cr · Spent ₹1.85 Cr · Progress 46%

## Endpoints (under /api)
`/auth/login`, `/auth/me`, `/auth/users`, `/projects`, `/projects/{id}`, `/dashboard/summary`,
`/stages`, `/boq`, `/materials`, `/site-reports` (GET/POST), `/billing`, `/quality` (PATCH),
`/snags` (PATCH), `/team`, `/approvals`, `/stages/{id}` (PATCH)

## Design
Charcoal + Gold/Bronze editorial palette · Playfair-style display + sans body · Card-based, glass-overlay hero · 4 bottom tabs (Dashboard / Projects / Site / Profile)

## Smart business enhancement
Client Portal automatically strips internal cost / vendor margin data — enabling owners to be invited into the app for live progress tracking without compromising the developer's margin confidentiality. This is a direct upsell lever: "transparency without exposure."

## Not yet implemented (future work)
Photo uploads (base64 endpoint planned), drawings/documents version control, push notifications, refresh tokens, multi-project support beyond Villa Aurelia.
