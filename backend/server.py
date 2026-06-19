"""Regal Park Villas — Construction Management API (Sterlitee Developers LLP).

FastAPI + MongoDB (Motor + GridFS) backend. App assembly only:
models, auth, seeding and route handlers live in their own modules.
All routes are namespaced under /api per the Kubernetes ingress contract.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS, MONGO_URL, REDIS_URL, SEED_DEMO_DATA, client, db, log
from routes import (
    admin,
    auth_routes,
    checklists,
    coo,
    core,
    crm,
    documents,
    files,
    inventory,
    landowner,
    permissions,
    plots,
    portal,
    procurement,
    reports_pdf,
    workflow,
)
from seed import migrate_base64_to_gridfs, seed_crm, seed_db, seed_plots, seed_v2

# ── Rate limiting (CRIT-3 → now distributed via Redis) ──────────────
from rate_limiter import RATE_LIMITS, RateLimiter
import time as _time

_app_start_time = _time.time()

_limiter = RateLimiter(redis_url=REDIS_URL)


app = FastAPI(title="Regal Park Villas API")
api = APIRouter(prefix="/api")

_VERSION = "1.0.0"


@api.get("/")
async def root():
    return {"app": "Regal Park Villas", "company": "Sterlitee Developers LLP", "version": _VERSION, "status": "ok"}


@api.get("/health")
async def health():
    """Health check — verifies API + MongoDB connectivity. Used by Docker, K8s, and monitoring."""
    mongo_err = None
    try:
        result = await db.command("ping")
        mongo_ok = result.get("ok") == 1.0
    except Exception as e:
        mongo_ok = False
        mongo_err = str(e)[:200]

    uptime_s = round(_time.time() - _app_start_time)
    resp = {
        "status": "healthy" if mongo_ok else "degraded",
        "version": _VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime_s,
        "mongo": "connected" if mongo_ok else "unreachable",
        "environment": "production" if not SEED_DEMO_DATA else "development",
        "seed_demo_data": SEED_DEMO_DATA,
    }
    if mongo_err:
        resp["mongo_error"] = mongo_err
        resp["mongo_url_prefix"] = MONGO_URL[:45] + "..." if MONGO_URL else "NOT SET"
    return resp


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
api.include_router(inventory.router)
api.include_router(landowner.router)
api.include_router(admin.router)
api.include_router(permissions.router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Rate limit middleware (CRIT-3 — Redis-backed) ───────────────────
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

    if not await _limiter.check(client_ip, tier):
        from starlette.responses import JSONResponse
        max_req, window = RATE_LIMITS[tier]
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit exceeded: {max_req} {tier} requests per {window}s. Try again later."
            },
            headers={"Retry-After": str(window)},
        )

    response: Response = await call_next(request)
    return response


# ── Request logging middleware (production monitoring) ───────────────
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with method, path, status, and duration."""
    path = request.url.path
    # Skip health check noise
    if path in ("/api/health", "/api/"):
        return await call_next(request)

    start = _time.time()
    response: Response = await call_next(request)
    duration_ms = round((_time.time() - start) * 1000, 1)

    client_ip = request.client.host if request.client else "unknown"
    log.info(
        "request_log | %s %s | %d | %.1fms | ip=%s",
        request.method, path, response.status_code, duration_ms, client_ip,
    )

    # Warn on slow requests (> 2s)
    if duration_ms > 2000:
        log.warning("slow_request | %s %s | %.1fms", request.method, path, duration_ms)

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

        # Refresh tokens (CRIT-2)
        await db.refresh_tokens.create_index("token", unique=True)
        await db.refresh_tokens.create_index("user_id")
        await db.refresh_tokens.create_index(
            "expires_at", expireAfterSeconds=0,  # TTL: auto-delete expired tokens
        )

        # CRIT-4: Unique partial index — only one active booking per plot
        # This prevents double-booking at the database level
        await db.bookings.create_index(
            [("plot_no", 1)],
            unique=True,
            partialFilterExpression={"status": {"$in": ["PROVISIONAL", "APPROVED", "CONFIRMED"]}},
            name="unique_active_booking_per_plot",
        )

        log.info("MongoDB indexes ensured.")
    except Exception as e:
        log.exception("Index creation failed: %s", e)


@app.on_event("startup")
async def on_startup():
    # Test MongoDB connection
    try:
        result = await db.command("ping")
        log.info("MongoDB connected OK: %s", result)
    except Exception as e:
        log.error("MongoDB connection FAILED: %s", e)
        log.error("MONGO_URL prefix: %s", MONGO_URL[:45] if MONGO_URL else "NOT SET")
        # Don't block startup — API will return errors for DB-dependent routes
        return  # Skip seeding if DB is unreachable

    try:
        # Initialize distributed rate limiter (optional — no Redis in serverless)
        await _limiter.connect()
    except Exception as e:
        log.info("Rate limiter connect skipped (non-fatal): %s", e)

    try:
        await _ensure_indexes()
    except Exception as e:
        log.info("Index creation skipped (non-fatal): %s", e)

    try:
        # Seed role permission matrix defaults
        from routes.permissions import seed_default_permissions
        await seed_default_permissions()
    except Exception as e:
        log.info("Permission seed skipped (non-fatal): %s", e)

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
    try:
        await _limiter.close()
    except Exception:
        pass
    try:
        client.close()
    except Exception:
        pass

