"""Procurement: purchase order lifecycle (REQUESTED → APPROVED → ORDERED → DELIVERED)."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import (
    PO_APPROVE_ROLES,
    PO_CANCEL_ROLES,
    PO_DELIVER_ROLES,
    PO_ORDER_ROLES,
    PO_REQUEST_ROLES,
    get_current_user,
    require_internal,
    require_roles,
)
from config import db
from models import POTransition, PurchaseOrder, PurchaseOrderCreate, User

router = APIRouter()

TRANSITIONS = {
    "approve": {"from": "REQUESTED", "to": "APPROVED", "roles": PO_APPROVE_ROLES},
    "order": {"from": "APPROVED", "to": "ORDERED", "roles": PO_ORDER_ROLES},
    "deliver": {"from": "ORDERED", "to": "DELIVERED", "roles": PO_DELIVER_ROLES},
    "cancel": {"from": None, "to": "CANCELLED", "roles": PO_CANCEL_ROLES},
}
TERMINAL = {"DELIVERED", "CANCELLED"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/purchase-orders", response_model=List[PurchaseOrder])
async def list_purchase_orders(
    project_id: Optional[str] = None,
    user: User = Depends(require_internal),
):
    q = {"project_id": project_id} if project_id else {}
    rows = await db.purchase_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [PurchaseOrder(**r) for r in rows]


@router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    user: User = Depends(require_roles(PO_REQUEST_ROLES)),
):
    count = await db.purchase_orders.count_documents({})
    po = PurchaseOrder(
        id=str(uuid.uuid4()),
        po_number=f"PO-RPV-{count + 101:03d}",
        total_inr=round(body.quantity * body.rate_inr, 2),
        status="REQUESTED",
        requested_by=user.full_name,
        created_at=_now(),
        history=[{"status": "REQUESTED", "by": user.full_name, "at": _now(), "note": body.notes}],
        **body.dict(),
    )
    await db.purchase_orders.insert_one(po.dict())
    return po


@router.patch("/purchase-orders/{po_id}/transition", response_model=PurchaseOrder)
async def transition_purchase_order(
    po_id: str,
    body: POTransition,
    user: User = Depends(get_current_user),
):
    spec = TRANSITIONS.get(body.action)
    if not spec:
        raise HTTPException(400, f"Unknown action. Use: {', '.join(TRANSITIONS)}")
    if user.role not in spec["roles"]:
        raise HTTPException(403, f"Role {user.role} cannot perform '{body.action}'")

    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po["status"] in TERMINAL:
        raise HTTPException(409, f"PO already {po['status']}")
    if spec["from"] and po["status"] != spec["from"]:
        raise HTTPException(409, f"Cannot {body.action} a PO in status {po['status']}")

    entry = {"status": spec["to"], "by": user.full_name, "at": _now(), "note": body.note}
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": spec["to"]}, "$push": {"history": entry}},
    )
    doc = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return PurchaseOrder(**doc)
