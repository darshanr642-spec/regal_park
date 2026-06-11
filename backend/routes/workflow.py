"""Approval workflow: request → review → approve/reject with role routing.

CLIENT users only see requests routed to the CLIENT role (e.g. material
selections), keeping internal approvals invisible to them.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user, require_internal
from config import db
from models import ROLES, ApprovalDecision, ApprovalRequest, ApprovalRequestCreate, User

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/approval-requests", response_model=List[ApprovalRequest])
async def list_approval_requests(
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    q: dict = {"project_id": project_id} if project_id else {}
    if user.role == "CLIENT":
        q["assignee_role"] = "CLIENT"
    rows = await db.approval_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ApprovalRequest(**r) for r in rows]


@router.post("/approval-requests", response_model=ApprovalRequest)
async def create_approval_request(
    body: ApprovalRequestCreate,
    user: User = Depends(require_internal),
):
    if body.assignee_role not in ROLES:
        raise HTTPException(400, "Unknown assignee role")
    req = ApprovalRequest(
        id=str(uuid.uuid4()),
        requested_by=user.full_name,
        status="PENDING",
        created_at=_now(),
        **body.dict(),
    )
    await db.approval_requests.insert_one(req.dict())
    return req


@router.patch("/approval-requests/{req_id}/decide", response_model=ApprovalRequest)
async def decide_approval_request(
    req_id: str,
    body: ApprovalDecision,
    user: User = Depends(get_current_user),
):
    if body.decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "Decision must be APPROVED or REJECTED")
    req = await db.approval_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Approval request not found")
    if req["status"] != "PENDING":
        raise HTTPException(409, f"Request already {req['status']}")
    if user.role != req["assignee_role"] and user.role != "ADMIN":
        raise HTTPException(403, f"Only {req['assignee_role']} (or ADMIN) can decide this request")

    await db.approval_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": body.decision,
            "decision_by": user.full_name,
            "decision_note": body.note,
            "decided_at": _now(),
        }},
    )
    doc = await db.approval_requests.find_one({"id": req_id}, {"_id": 0})
    return ApprovalRequest(**doc)
