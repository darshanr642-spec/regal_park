# Regal Park Villas — PRD
**Company:** Sterlitee Developers LLP · **App:** Regal Park Villas
Mobile-first construction management app for ₹4 Cr luxury villa projects (Expo + FastAPI + MongoDB).

## Core Requirements (original)
- JWT custom auth (email+password), 18 roles, strict server-side RBAC
- CLIENT role: never sees budgets/costs/BOQ/billing; team PII masked (phone/email = "—")
- Modules: Dashboard, Projects, Stages, BOQ, Procurement, Daily Site Reports, Billing, Client Portal, Documents, Approvals, Quality, Snags, Team, PDF Reports
- Multi-project support; photo/document uploads; PDF report generation; pagination; photo lightbox
- Branding: "Sterlitee Developers LLP" / "Regal Park Villas" (navy #151547 + gold logo)

## Seed Data
- **Villa Aurelia** (Plot 12) ₹4 Cr, 7,850 sqft, 46% · **Villa Celeste** (Plot 08) · **Villa Meridian** (Plot 05)
- 11 role users (see /app/memory/test_credentials.md), 23 stages, 20 BOQ items, 12 materials, 6 bills, quality checks, 8 snags, 12 team members, 8 statutory approvals, 5 daily reports, 5 documents, 5 POs, 4 approval requests, 8 checklist templates, 2-3 stage checklists

## Implemented (sessions 1–2, all tested)
### Session 1 (iterations 1–3, 100% pass)
- JWT auth + RBAC, dashboard, projects, stages timeline, site reports + photos, snags, documents pagination, PDF reports (reportlab), team PII scrubbing, photo lightbox (pinch-zoom), image compression (expo-image-manipulator), Sterlitee branding

### Session 2 — 2026-06 (iteration 4, 38/38 backend + frontend 100% pass)
- **GridFS storage migration**: files in MongoDB GridFS, streamed via `GET /api/files/{id}` (Bearer header OR `?token=` query); multipart `POST /api/files` (internal roles only, 15MB cap); startup migration converted all legacy base64 → file_url; document delete cleans GridFS blob
- **Procurement PO lifecycle**: REQUESTED→APPROVED→ORDERED→DELIVERED (+CANCELLED); role-gated transitions (approve: ADMIN/PD/PM; order: ADMIN/PROC_MGR; deliver: +SE/STORE_KEEPER; cancel: ADMIN/PD); dedicated screen `app/module/procurement.tsx` with stepper UI + raise-PO form + materials tab
- **Approval workflow**: request→approve/reject routed by assignee_role; CLIENT sees only CLIENT-assigned; decide restricted to assignee_role or ADMIN; screen `app/module/approvals.tsx` (Awaiting-your-decision, new request form, statutory list)
- **Stage quality checklists**: 8 stage templates; instantiate per project+stage (409 dup); item toggle PASS/FAIL/PENDING (WRITE_QUALITY_ROLES); sign-off requires all PASS (ADMIN/PM/QS); items locked after sign-off; UI in Site→QUALITY tab
- **Backend refactor**: monolith → `config.py`, `models.py`, `auth_utils.py`, `seed.py`, `routes/{auth_routes,core,documents,files,procurement,workflow,checklists,reports_pdf}.py`; server.py is app assembly only
- **Sterlitee logo branding**: animated BrandSplash at app start (plays once per session), Watermark component on all screens, logo on login, app icons/splash assets regenerated (navy #151547), logo embedded in PDF report headers
- Client profile menu filtered (Team/Approvals/Documents/Client Portal only)

## Architecture
- Backend: FastAPI, Motor + GridFS, PyJWT, bcrypt, reportlab · routes under `/api` · port 8001
- Frontend: Expo (file-based routing), Context (auth/project), `fileUri()` helper appends token to GridFS URLs
- Key endpoints: /api/auth/*, /api/projects, /api/dashboard/summary, /api/stages, /api/boq, /api/materials, /api/site-reports, /api/billing, /api/quality, /api/snags, /api/team, /api/approvals, /api/documents (paginated), /api/files, /api/purchase-orders (+/transition), /api/approval-requests (+/decide), /api/checklist-templates, /api/stage-checklists (+items, +sign-off), /api/reports/{progress|cost|delay|safety}
- Tests: /app/backend/tests/test_iteration3.py, test_iteration4.py · reports /app/test_reports/iteration_4.json

## Backlog
- P2: Push toward production deployment hardening (deployment_agent check)
- P2: In-app notifications/activity feed for PO & approval state changes
- P2: Client-facing progress photo gallery
- P3: Offline support for site engineers
