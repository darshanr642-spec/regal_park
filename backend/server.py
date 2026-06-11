"""Regal Park Villas — Construction Management API (Sterlitee Developers LLP).

FastAPI + MongoDB (Motor + GridFS) backend. App assembly only:
models, auth, seeding and route handlers live in their own modules.
All routes are namespaced under /api per the Kubernetes ingress contract.
"""
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from config import client, log
from routes import (
    auth_routes,
    checklists,
    core,
    documents,
    files,
    procurement,
    reports_pdf,
    workflow,
)
from seed import migrate_base64_to_gridfs, seed_db, seed_v2

app = FastAPI(title="Regal Park Villas API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "Regal Park Villas", "company": "Sterlitee Developers LLP", "status": "ok"}


api.include_router(auth_routes.router)
api.include_router(core.router)
api.include_router(documents.router)
api.include_router(files.router)
api.include_router(procurement.router)
api.include_router(workflow.router)
api.include_router(checklists.router)
api.include_router(reports_pdf.router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await seed_db()
        await seed_v2()
        await migrate_base64_to_gridfs()
    except Exception as e:
        log.exception("Startup seed/migration failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
