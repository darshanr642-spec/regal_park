"""Admin Edit Center — CRUD routes for all master data (ADMIN only).

Every mutation writes to the `admin_audit_log` collection for traceability.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user, hash_pw, require_roles
from config import db
from models import ROLES, User

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_ONLY = require_roles({"ADMIN"})


# ── Audit helper ─────────────────────────────────────────────────────

async def _audit(
    user: User,
    module: str,
    action: str,
    target_id: str,
    changes: Dict[str, Any],
):
    """Write an audit log entry."""
    await db.admin_audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "user_name": user.full_name,
        "module": module,
        "action": action,
        "target_id": target_id,
        "changes": changes,
        "timestamp": datetime.now(timezone.utc),
    })


def _diff(old: dict, new: dict, fields: list) -> dict:
    """Compute {field: {old, new}} for changed fields only."""
    d = {}
    for f in fields:
        if f in new and new[f] is not None and old.get(f) != new[f]:
            d[f] = {"old": old.get(f), "new": new[f]}
    return d


# ── Summary ──────────────────────────────────────────────────────────

@router.get("/summary")
async def admin_summary(user: User = Depends(ADMIN_ONLY)):
    """Module counts for the edit center landing."""
    return {
        "users": await db.users.count_documents({}),
        "projects": await db.projects.count_documents({}),
        "plots": await db.plots.count_documents({}),
        "boq": await db.boq.count_documents({}),
        "procurement": await db.purchase_orders.count_documents({}),
        "team": await db.team.count_documents({}),
        "pricing": await db.pricing.count_documents({}),
        "leads": await db.leads.count_documents({}),
        "bookings": await db.bookings.count_documents({}),
        "audit_entries": await db.admin_audit_log.count_documents({}),
    }


# ══════════════════════════════════════════════════════════════════════
#  1. USERS
# ══════════════════════════════════════════════════════════════════════

class UserPatch(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/users")
async def list_users(user: User = Depends(ADMIN_ONLY)):
    rows = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(500)
    return rows


@router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not doc:
        raise HTTPException(404, "User not found")
    updates = body.dict(exclude_none=True)
    if "role" in updates and updates["role"] not in ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {ROLES}")
    if not updates:
        raise HTTPException(400, "No fields to update")

    changes = _diff(doc, updates, list(updates.keys()))
    await db.users.update_one({"id": user_id}, {"$set": updates})
    await _audit(user, "users", "update", user_id, changes)
    return {"ok": True, "changes": changes}


class ResetPasswordBody(BaseModel):
    temp_password: str


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPasswordBody, user: User = Depends(ADMIN_ONLY)):
    doc = await db.users.find_one({"id": user_id})
    if not doc:
        raise HTTPException(404, "User not found")
    if len(body.temp_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    await db.users.update_one({"id": user_id}, {"$set": {"hashed_password": hash_pw(body.temp_password)}})
    await _audit(user, "users", "reset_password", user_id, {"password": {"old": "***", "new": "***"}})
    return {"ok": True, "message": "Password reset"}


# ══════════════════════════════════════════════════════════════════════
#  2. PROJECTS
# ══════════════════════════════════════════════════════════════════════

class ProjectPatch(BaseModel):
    name: Optional[str] = None
    plot_number: Optional[str] = None
    client_name: Optional[str] = None
    villa_type: Optional[str] = None
    built_up_area_sqft: Optional[int] = None
    start_date: Optional[str] = None
    target_handover_date: Optional[str] = None
    budget_inr: Optional[float] = None
    progress_pct: Optional[float] = None
    status: Optional[str] = None


@router.get("/projects")
async def list_projects(user: User = Depends(ADMIN_ONLY)):
    return await db.projects.find({}, {"_id": 0}).to_list(200)


@router.patch("/projects/{project_id}")
async def patch_project(project_id: str, body: ProjectPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    changes = _diff(doc, updates, list(updates.keys()))
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    await _audit(user, "projects", "update", project_id, changes)
    return {"ok": True, "changes": changes}


# ══════════════════════════════════════════════════════════════════════
#  3. PLOTS
# ══════════════════════════════════════════════════════════════════════

class PlotPatch(BaseModel):
    villa_type: Optional[str] = None
    dimension_ft: Optional[str] = None
    status: Optional[str] = None
    sales_status: Optional[str] = None
    asking_price_inr: Optional[float] = None
    premium_pct: Optional[float] = None
    facing: Optional[str] = None
    is_corner: Optional[bool] = None
    elevation_type: Optional[str] = None
    landowner_id: Optional[str] = None


@router.get("/plots")
async def list_plots(user: User = Depends(ADMIN_ONLY)):
    return await db.plots.find({}, {"_id": 0}).sort("plot_no", 1).to_list(500)


@router.patch("/plots/{plot_no}")
async def patch_plot(plot_no: int, body: PlotPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Plot not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    changes = _diff(doc, updates, list(updates.keys()))
    await db.plots.update_one({"plot_no": plot_no}, {"$set": updates})
    await _audit(user, "plots", "update", str(plot_no), changes)
    return {"ok": True, "changes": changes}


class PlotBulkImport(BaseModel):
    plots: List[dict]


@router.post("/plots/import")
async def import_plots(body: PlotBulkImport, user: User = Depends(ADMIN_ONLY)):
    """Bulk import/update plots from JSON array. Upserts by plot_no."""
    created, updated = 0, 0
    for p in body.plots:
        plot_no = p.get("plot_no")
        if plot_no is None:
            continue
        existing = await db.plots.find_one({"plot_no": plot_no})
        if existing:
            await db.plots.update_one({"plot_no": plot_no}, {"$set": p})
            updated += 1
        else:
            p.setdefault("id", str(uuid.uuid4()))
            p.setdefault("status", "AVAILABLE")
            p.setdefault("sales_status", "AVAILABLE")
            await db.plots.insert_one(p)
            created += 1
    await _audit(user, "plots", "bulk_import", "bulk", {"created": created, "updated": updated})
    return {"ok": True, "created": created, "updated": updated}


# ══════════════════════════════════════════════════════════════════════
#  4. BOQ
# ══════════════════════════════════════════════════════════════════════

class BOQCreate(BaseModel):
    project_id: str
    description: str
    category: str
    unit: str
    quantity: float
    rate_inr: float
    vendor: Optional[str] = ""


class BOQPatch(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    rate_inr: Optional[float] = None
    amount_inr: Optional[float] = None
    vendor: Optional[str] = None
    approved_budget_inr: Optional[float] = None
    actual_spent_inr: Optional[float] = None
    payment_status: Optional[str] = None


@router.get("/boq")
async def list_boq(user: User = Depends(ADMIN_ONLY)):
    return await db.boq.find({}, {"_id": 0}).to_list(1000)


@router.post("/boq")
async def create_boq(body: BOQCreate, user: User = Depends(ADMIN_ONLY)):
    doc = {
        "id": str(uuid.uuid4()),
        "project_id": body.project_id,
        "description": body.description,
        "category": body.category,
        "unit": body.unit,
        "quantity": body.quantity,
        "rate_inr": body.rate_inr,
        "amount_inr": body.quantity * body.rate_inr,
        "vendor": body.vendor or "",
        "approved_budget_inr": body.quantity * body.rate_inr,
        "actual_spent_inr": 0,
        "payment_status": "PENDING",
    }
    await db.boq.insert_one(doc)
    await _audit(user, "boq", "create", doc["id"], {"item": body.description})
    return {"ok": True, "id": doc["id"]}


@router.patch("/boq/{item_id}")
async def patch_boq(item_id: str, body: BOQPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.boq.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "BOQ item not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    # Auto-recalculate amount if qty or rate changed
    qty = updates.get("quantity", doc.get("quantity", 0))
    rate = updates.get("rate_inr", doc.get("rate_inr", 0))
    updates["amount_inr"] = qty * rate

    changes = _diff(doc, updates, list(updates.keys()))
    await db.boq.update_one({"id": item_id}, {"$set": updates})
    await _audit(user, "boq", "update", item_id, changes)
    return {"ok": True, "changes": changes}


@router.delete("/boq/{item_id}")
async def delete_boq(item_id: str, user: User = Depends(ADMIN_ONLY)):
    doc = await db.boq.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "BOQ item not found")
    await db.boq.delete_one({"id": item_id})
    await _audit(user, "boq", "delete", item_id, {"deleted": doc.get("description", item_id)})
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════
#  5. PROCUREMENT
# ══════════════════════════════════════════════════════════════════════

class ProcurementPatch(BaseModel):
    material_name: Optional[str] = None
    vendor: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    rate_inr: Optional[float] = None
    status: Optional[str] = None
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None


@router.get("/procurement")
async def list_procurement(user: User = Depends(ADMIN_ONLY)):
    return await db.purchase_orders.find({}, {"_id": 0}).to_list(500)


@router.patch("/procurement/{po_id}")
async def patch_procurement(po_id: str, body: ProcurementPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Purchase order not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    # Recalc total if qty or rate changed
    if "quantity" in updates or "rate_inr" in updates:
        qty = updates.get("quantity", doc.get("quantity", 0))
        rate = updates.get("rate_inr", doc.get("rate_inr", 0))
        updates["total_inr"] = qty * rate

    changes = _diff(doc, updates, list(updates.keys()))
    await db.purchase_orders.update_one({"id": po_id}, {"$set": updates})
    await _audit(user, "procurement", "update", po_id, changes)
    return {"ok": True, "changes": changes}


# ══════════════════════════════════════════════════════════════════════
#  6. TEAM / CONTRACTORS
# ══════════════════════════════════════════════════════════════════════

class TeamCreate(BaseModel):
    project_id: str
    name: str
    role: str
    company: str
    phone: str
    email: str
    scope_of_work: str


class TeamPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    scope_of_work: Optional[str] = None
    status: Optional[str] = None


@router.get("/team")
async def list_team(user: User = Depends(ADMIN_ONLY)):
    return await db.team.find({}, {"_id": 0}).to_list(500)


@router.post("/team")
async def create_team_member(body: TeamCreate, user: User = Depends(ADMIN_ONLY)):
    doc = {
        "id": str(uuid.uuid4()),
        **body.dict(),
        "status": "Active",
    }
    await db.team.insert_one(doc)
    await _audit(user, "team", "create", doc["id"], {"name": body.name})
    return {"ok": True, "id": doc["id"]}


@router.patch("/team/{member_id}")
async def patch_team(member_id: str, body: TeamPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.team.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Team member not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    changes = _diff(doc, updates, list(updates.keys()))
    await db.team.update_one({"id": member_id}, {"$set": updates})
    await _audit(user, "team", "update", member_id, changes)
    return {"ok": True, "changes": changes}


# ══════════════════════════════════════════════════════════════════════
#  7. PRICING
# ══════════════════════════════════════════════════════════════════════

class PricingPatch(BaseModel):
    elevation_type: Optional[str] = None
    base_price_inr: Optional[float] = None
    base_price_per_sqft_inr: Optional[float] = None
    premium_pct: Optional[float] = None
    landowner_share_pct: Optional[float] = None
    developer_share_pct: Optional[float] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    status: Optional[str] = None


@router.get("/pricing")
async def list_pricing(user: User = Depends(ADMIN_ONLY)):
    return await db.pricing.find({}, {"_id": 0}).to_list(100)


@router.patch("/pricing/{pricing_id}")
async def patch_pricing(pricing_id: str, body: PricingPatch, user: User = Depends(ADMIN_ONLY)):
    doc = await db.pricing.find_one({"id": pricing_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pricing not found")
    updates = body.dict(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    changes = _diff(doc, updates, list(updates.keys()))
    await db.pricing.update_one({"id": pricing_id}, {"$set": updates})
    await _audit(user, "pricing", "update", pricing_id, changes)
    return {"ok": True, "changes": changes}


# ══════════════════════════════════════════════════════════════════════
#  8. APP SETTINGS
# ══════════════════════════════════════════════════════════════════════

DEFAULT_SETTINGS = {
    "id": "app_settings",
    "coo_dashboard_title": "COO Command Centre",
    "crm_dashboard_title": "Sales Dashboard",
    "inventory_dashboard_title": "Inventory Command Center",
    "landowner_dashboard_title": "Landowner Dashboard",
    "portal_title": "My Villa Portal",
    "kpi_visibility": {},
}


@router.get("/settings")
async def get_settings(user: User = Depends(ADMIN_ONLY)):
    doc = await db.app_settings.find_one({"id": "app_settings"}, {"_id": 0})
    if not doc:
        return DEFAULT_SETTINGS
    return doc


@router.patch("/settings")
async def patch_settings(body: dict, user: User = Depends(ADMIN_ONLY)):
    existing = await db.app_settings.find_one({"id": "app_settings"}, {"_id": 0})
    if not existing:
        existing = dict(DEFAULT_SETTINGS)
        await db.app_settings.insert_one(existing)

    body.pop("id", None)
    body.pop("_id", None)
    if not body:
        raise HTTPException(400, "No fields to update")

    changes = _diff(existing, body, list(body.keys()))
    await db.app_settings.update_one({"id": "app_settings"}, {"$set": body})
    await _audit(user, "settings", "update", "app_settings", changes)
    return {"ok": True, "changes": changes}


# ══════════════════════════════════════════════════════════════════════
#  9. AUDIT LOG
# ══════════════════════════════════════════════════════════════════════

@router.get("/audit-log")
async def get_audit_log(user: User = Depends(ADMIN_ONLY)):
    """Return last 100 audit entries, newest first."""
    rows = await db.admin_audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    # Convert datetimes to ISO strings for JSON
    for r in rows:
        if "timestamp" in r and hasattr(r["timestamp"], "isoformat"):
            r["timestamp"] = r["timestamp"].isoformat()
    return rows
