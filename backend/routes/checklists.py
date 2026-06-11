"""Stage quality checklists: templates, instantiation, item toggles, sign-off."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import (
    CHECKLIST_SIGNOFF_ROLES,
    WRITE_QUALITY_ROLES,
    get_current_user,
    require_internal,
    require_roles,
)
from config import db
from models import (
    ChecklistItem,
    ChecklistItemUpdate,
    ChecklistTemplate,
    StageChecklist,
    StageChecklistCreate,
    User,
)

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/checklist-templates", response_model=List[ChecklistTemplate])
async def list_templates(user: User = Depends(require_internal)):
    rows = await db.checklist_templates.find({}, {"_id": 0}).to_list(100)
    return [ChecklistTemplate(**r) for r in rows]


@router.get("/stage-checklists", response_model=List[StageChecklist])
async def list_stage_checklists(
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    q = {"project_id": project_id} if project_id else {}
    rows = await db.stage_checklists.find(q, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [StageChecklist(**r) for r in rows]


@router.post("/stage-checklists", response_model=StageChecklist)
async def instantiate_checklist(
    body: StageChecklistCreate,
    user: User = Depends(require_roles(WRITE_QUALITY_ROLES)),
):
    existing = await db.stage_checklists.find_one(
        {"project_id": body.project_id, "stage_name": body.stage_name}
    )
    if existing:
        raise HTTPException(409, f"Checklist for stage '{body.stage_name}' already exists")
    tpl = await db.checklist_templates.find_one({"stage_name": body.stage_name}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, f"No template for stage '{body.stage_name}'")
    checklist = StageChecklist(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        stage_name=body.stage_name,
        items=[ChecklistItem(id=str(uuid.uuid4()), text=t) for t in tpl["items"]],
        created_at=_now(),
    )
    await db.stage_checklists.insert_one(checklist.dict())
    return checklist


@router.patch("/stage-checklists/{cid}/items/{item_id}", response_model=StageChecklist)
async def update_checklist_item(
    cid: str,
    item_id: str,
    body: ChecklistItemUpdate,
    user: User = Depends(require_roles(WRITE_QUALITY_ROLES)),
):
    if body.status not in ("PENDING", "PASS", "FAIL"):
        raise HTTPException(400, "Status must be PENDING, PASS or FAIL")
    cl = await db.stage_checklists.find_one({"id": cid}, {"_id": 0})
    if not cl:
        raise HTTPException(404, "Checklist not found")
    if cl.get("signed_off"):
        raise HTTPException(409, "Checklist already signed off — items are locked")
    if not any(i["id"] == item_id for i in cl["items"]):
        raise HTTPException(404, "Checklist item not found")

    await db.stage_checklists.update_one(
        {"id": cid, "items.id": item_id},
        {"$set": {
            "items.$.status": body.status,
            "items.$.remarks": body.remarks,
            "items.$.checked_by": user.full_name,
            "items.$.checked_at": _now(),
        }},
    )
    doc = await db.stage_checklists.find_one({"id": cid}, {"_id": 0})
    return StageChecklist(**doc)


@router.post("/stage-checklists/{cid}/sign-off", response_model=StageChecklist)
async def sign_off_checklist(
    cid: str,
    user: User = Depends(require_roles(CHECKLIST_SIGNOFF_ROLES)),
):
    cl = await db.stage_checklists.find_one({"id": cid}, {"_id": 0})
    if not cl:
        raise HTTPException(404, "Checklist not found")
    if cl.get("signed_off"):
        raise HTTPException(409, "Checklist already signed off")
    if any(i["status"] != "PASS" for i in cl["items"]):
        raise HTTPException(409, "All items must be PASS before sign-off")

    await db.stage_checklists.update_one(
        {"id": cid},
        {"$set": {"signed_off": True, "signed_off_by": user.full_name, "signed_off_at": _now()}},
    )
    doc = await db.stage_checklists.find_one({"id": cid}, {"_id": 0})
    return StageChecklist(**doc)
