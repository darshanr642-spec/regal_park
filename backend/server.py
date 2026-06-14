"""Regal Park Villas — Construction Management API (Sterlitee Developers LLP).

FastAPI + MongoDB (Motor + GridFS) backend. App assembly only:
models, auth, seeding and route handlers live in their own modules.
All routes are namespaced under /api per the Kubernetes ingress contract.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS, SEED_DEMO_DATA, client, db, log
from routes import (
    auth_routes,
    checklists,
    coo,
    core,
    crm,
    documents,
    files,
    plots,
    portal,
    procurement,
    reports_pdf,
    workflow,
)
from seed import migrate_base64_to_gridfs, seed_crm, seed_db, seed_plots, seed_v2

# ── Rate limiting (CRIT-3) ──────────────────────────────────────────
# Three tiers: login (5/min), write (30/min), read (120/min) per IP
from collections import defaultdict
import time as _time

_rate_buckets: dict[str, list] = defaultdict(list)

_RATE_LIMITS = {
    "login": (5, 60),     # 5 requests per 60 seconds
    "write": (30, 60),    # 30 requests per 60 seconds
    "read": (120, 60),    # 120 requests per 60 seconds
}


def _check_rate(key: str, tier: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    max_requests, window = _RATE_LIMITS[tier]
    now = _time.time()
    bucket_key = f"{tier}:{key}"
    bucket = _rate_buckets[bucket_key]
    # Evict expired entries
    _rate_buckets[bucket_key] = [t for t in bucket if now - t < window]
    bucket = _rate_buckets[bucket_key]
    if len(bucket) >= max_requests:
        return False
    bucket.append(now)
    return True


app = FastAPI(title="Regal Park Villas API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "Regal Park Villas", "company": "Sterlitee Developers LLP", "status": "ok"}


@api.get("/health")
async def health():
    """Health check — verifies API + MongoDB connectivity."""
    try:
        result = await db.command("ping")
        mongo_ok = result.get("ok") == 1.0
    except Exception:
        mongo_ok = False

    return {
        "status": "healthy" if mongo_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mongo": "connected" if mongo_ok else "unreachable",
        "seed_demo_data": SEED_DEMO_DATA,
    }


api.include_router(auth_routes.router)
api.include_router(core.router)
api.include_router(documents.router)
api.include_router(files.router)
api.include_router(procurement.router)
api.include_router(workflow.router)
api.include_router(checklists.router)
api.include_router(plots.router)
api.include_router(reports_pdf.router)
api.include_router(crm.router)
api.include_router(portal.router)
api.include_router(coo.router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Rate limit middleware (CRIT-3) ──────────────────────────────────
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Tiered rate limiting: login=5/min, writes=30/min, reads=120/min per IP."""
    client_ip = request.client.host if request.client else "unknown"
    path = request.url.path

    # Determine tier
    if path.endswith("/auth/login") and request.method == "POST":
        tier = "login"
    elif request.method in ("POST", "PUT", "PATCH", "DELETE"):
        tier = "write"
    else:
        tier = "read"

    if not _check_rate(client_ip, tier):
        from starlette.responses import JSONResponse
        max_req, window = _RATE_LIMITS[tier]
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit exceeded: {max_req} {tier} requests per {window}s. Try again later."
            },
            headers={"Retry-After": str(window)},
        )

    response: Response = await call_next(request)
    return response


async def _ensure_indexes():
    """Create MongoDB indexes for performance and uniqueness."""
    try:
        # Users
        await db.users.create_index("email", unique=True)
        await db.users.create_index("role")

        # Projects & stages
        await db.projects.create_index("id", unique=True)
        await db.stages.create_index("project_id")
        await db.stages.create_index([("project_id", 1), ("name", 1)])

        # Documents
        await db.documents.create_index("project_id")
        await db.documents.create_index([("project_id", 1), ("stage", 1)])

        # Procurement
        await db.purchase_orders.create_index("project_id")
        await db.purchase_orders.create_index("po_number", unique=True)

        # Approvals
        await db.approval_requests.create_index("project_id")
        await db.approval_requests.create_index("status")

        # Checklists
        await db.checklist_templates.create_index("stage")
        await db.stage_checklists.create_index([("project_id", 1), ("stage", 1)])

        # Plots
        await db.plots.create_index("plot_no", unique=True)
        await db.plots.create_index("status")
        await db.plots.create_index("elevation")
        await db.plots.create_index("sales_status")
        await db.plots.create_index("facing")
        await db.plots.create_index("elevation_type")

        # CRM
        await db.leads.create_index("status")
        await db.leads.create_index("assigned_to")
        await db.leads.create_index("source")
        await db.bookings.create_index("plot_no")
        await db.bookings.create_index("status")
        await db.bookings.create_index("lead_id")
        await db.booking_approvals.create_index("booking_id")
        await db.booking_approvals.create_index("overall_status")
        await db.booking_approvals.create_index("current_level")
        await db.discount_requests.create_index("booking_id")
        await db.discount_requests.create_index("status")
        await db.discount_requests.create_index("required_approver_role")
        await db.payment_milestones.create_index("booking_id")
        await db.payment_milestones.create_index("project_id")
        await db.payment_milestones.create_index("status")
        await db.quotations.create_index("lead_id")
        await db.site_visits.create_index("lead_id")
        await db.crm_activities.create_index("lead_id")
        await db.pricing.create_index("elevation_type")

        log.info("MongoDB indexes ensured.")
    except Exception as e:
        log.exception("Index creation failed: %s", e)


@app.on_event("startup")
async def on_startup():
    await _ensure_indexes()

    if SEED_DEMO_DATA:
        try:
            await seed_db()
            await seed_v2()
            await seed_plots()
            await seed_crm()
            await migrate_base64_to_gridfs()
        except Exception as e:
            log.exception("Startup seed/migration failed: %s", e)
    else:
        log.info("SEED_DEMO_DATA is false — skipping demo seed.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
