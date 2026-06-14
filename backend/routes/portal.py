"""Customer Portal — Client-facing read-only APIs.

Only exposes what a CLIENT should see: villa name, progress, stages,
milestones. Never exposes BOQ, bills, procurement, team details, or costs.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user, require_roles
from config import db
from models import User

router = APIRouter(prefix="/portal", tags=["Portal"])

CLIENT_ROLES = {"CLIENT", "ADMIN"}


async def _get_client_project(user: User):
    """Find the project belonging to this client. ADMIN sees the first project."""
    if user.role == "ADMIN":
        project = await db.projects.find_one({}, {"_id": 0})
    else:
        project = await db.projects.find_one({"client_id": user.id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "No project found for your account")
    return project


@router.get("/dashboard")
async def portal_dashboard(user: User = Depends(require_roles(CLIENT_ROLES))):
    """Client dashboard — villa name, progress, current stage, next milestone."""
    project = await _get_client_project(user)

    # Get stages sorted by order
    stages = await db.stages.find(
        {"project_id": project["id"]},
        {"_id": 0, "id": 1, "name": 1, "order": 1, "progress_pct": 1, "status": 1,
         "planned_start": 1, "planned_end": 1},
    ).sort("order", 1).to_list(50)

    # Current stage: first non-COMPLETED
    current_stage = None
    for s in stages:
        if s.get("status") != "COMPLETED":
            current_stage = {
                "name": s["name"],
                "progress_pct": s.get("progress_pct", 0),
                "status": s.get("status", "NOT_STARTED"),
            }
            break

    # Next payment milestone
    next_milestone = None
    ms = await db.payment_milestones.find(
        {"project_id": project["id"], "status": "PENDING"},
        {"_id": 0, "milestone_name": 1, "amount_inr": 1, "order": 1, "due_date": 1},
    ).sort("order", 1).to_list(1)
    if ms:
        next_milestone = ms[0]

    # Count paid milestones
    paid_count = await db.payment_milestones.count_documents(
        {"project_id": project["id"], "status": "PAID"},
    )
    total_ms = await db.payment_milestones.count_documents(
        {"project_id": project["id"]},
    )

    return {
        "villa_name": project["name"],
        "plot_number": project["plot_number"],
        "villa_type": project.get("villa_type", ""),
        "built_up_area_sqft": project.get("built_up_area_sqft", 0),
        "hero_image_url": project.get("hero_image_url", ""),
        "overall_progress": project.get("progress_pct", 0),
        "status": project.get("status", "IN_PROGRESS"),
        "start_date": project.get("start_date", ""),
        "target_handover_date": project.get("target_handover_date", ""),
        "current_stage": current_stage,
        "next_milestone": next_milestone,
        "milestones_paid": paid_count,
        "milestones_total": total_ms,
        "stages_count": len(stages),
    }


@router.get("/timeline")
async def portal_timeline(user: User = Depends(require_roles(CLIENT_ROLES))):
    """Construction timeline — stage names, status, progress. No internal details."""
    project = await _get_client_project(user)

    stages = await db.stages.find(
        {"project_id": project["id"]},
        {"_id": 0, "id": 1, "name": 1, "order": 1, "progress_pct": 1, "status": 1,
         "planned_start": 1, "planned_end": 1},
    ).sort("order", 1).to_list(50)

    return {
        "villa_name": project["name"],
        "plot_number": project["plot_number"],
        "overall_progress": project.get("progress_pct", 0),
        "stages": stages,
    }


@router.get("/payments")
async def portal_payments(user: User = Depends(require_roles(CLIENT_ROLES))):
    """Payment milestones — amounts, status, paid dates. No internal costs."""
    project = await _get_client_project(user)

    milestones = await db.payment_milestones.find(
        {"project_id": project["id"]},
        {"_id": 0, "id": 1, "milestone_name": 1, "order": 1, "amount_inr": 1,
         "due_date": 1, "paid_date": 1, "status": 1},
    ).sort("order", 1).to_list(20)

    total = sum(m["amount_inr"] for m in milestones)
    paid = sum(m["amount_inr"] for m in milestones if m["status"] == "PAID")

    return {
        "villa_name": project["name"],
        "plot_number": project["plot_number"],
        "total_inr": total,
        "paid_inr": paid,
        "pending_inr": total - paid,
        "milestones": milestones,
    }
