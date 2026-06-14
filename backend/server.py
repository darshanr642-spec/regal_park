"""Regal Park Villas — Construction Management API (Sterlitee Developers LLP).

FastAPI + MongoDB (Motor + GridFS) backend. App assembly only:
models, auth, seeding and route handlers live in their own modules.
All routes are namespaced under /api per the Kubernetes ingress contract.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS, SEED_DEMO_DATA, client, db, log
from routes import (
    auth_routes,
    checklists,
    core,
    crm,
    documents,
    files,
    plots,
    procurement,
    reports_pdf,
    workflow,
)
from seed import migrate_base64_to_gridfs, seed_crm, seed_db, seed_plots, seed_v2

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

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
