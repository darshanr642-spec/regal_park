"""Core domain routes: projects, dashboard, list endpoints, team, site mutations."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import (
    WRITE_QUALITY_ROLES,
    WRITE_STAGE_ROLES,
    get_current_user,
    require_finance,
    require_internal,
    require_roles,
)
from config import db
from models import (
    Approval,
    BOQItem,
    ContractorBill,
    DailySiteReport,
    Material,
    Project,
    QualityCheck,
    QualityToggle,
    SiteReportCreate,
    Snag,
    SnagUpdate,
    Stage,
    StageUpdate,
    TeamMember,
    User,
)

router = APIRouter()


# ---- Projects ----
@router.get("/projects", response_model=List[Project])
async def list_projects(user: User = Depends(get_current_user)):
    rows = await db.projects.find({}, {"_id": 0}).to_list(100)
    return [Project(**r) for r in rows]


@router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return Project(**doc)


# ---- Dashboard ----
@router.get("/dashboard/summary")
async def dashboard_summary(user: User = Depends(require_internal)):
    projects = await db.projects.find(
        {}, {"_id": 0, "budget_inr": 1, "actual_spent_inr": 1, "progress_pct": 1, "status": 1}
    ).to_list(100)
    stages = await db.stages.find(
        {}, {"_id": 0, "id": 1, "name": 1, "status": 1, "order": 1, "progress_pct": 1}
    ).to_list(500)
    bills = await db.bills.find(
        {}, {"_id": 0, "payment_status": 1, "net_payable_inr": 1}
    ).to_list(500)
    quality = await db.quality.find({}, {"_id": 0, "result": 1}).to_list(500)
    snags = await db.snags.find({}, {"_id": 0, "status": 1}).to_list(500)
    materials = await db.materials.find(
        {}, {"_id": 0, "received_qty": 1, "required_qty": 1}
    ).to_list(500)
    approvals = await db.approvals.find({}, {"_id": 0, "status": 1}).to_list(500)

    total_budget = sum(p["budget_inr"] for p in projects)
    total_spent = sum(p["actual_spent_inr"] for p in projects)
    delayed_tasks = [s for s in stages if s["status"] == "DELAYED"]
    pending_bills = [b for b in bills if b["payment_status"] != "PAID"]
    quality_issues = [q for q in quality if q["result"] == "FAIL"]
    open_snags = [s for s in snags if s["status"] != "RESOLVED"]
    pending_approvals = [a for a in approvals if a["status"] != "APPROVED"]
    materials_needed = [m for m in materials if m["received_qty"] < m["required_qty"]]

    avg_progress = (
        sum(p["progress_pct"] for p in projects) / len(projects) if projects else 0
    )

    return {
        "total_projects": len(projects),
        "under_construction": sum(1 for p in projects if p["status"] == "IN_PROGRESS"),
        "avg_progress_pct": round(avg_progress, 1),
        "total_budget_inr": total_budget,
        "actual_spent_inr": total_spent,
        "budget_used_pct": round(total_spent / total_budget * 100, 1) if total_budget else 0,
        "pending_approvals": len(pending_approvals),
        "delayed_tasks": len(delayed_tasks),
        "pending_bills": len(pending_bills),
        "pending_bills_amount_inr": sum(b["net_payable_inr"] for b in pending_bills),
        "quality_issues": len(quality_issues),
        "open_snags": len(open_snags),
        "materials_needed": len(materials_needed),
        "recent_activity": [
            {
                "id": s["id"],
                "type": "STAGE",
                "title": s["name"],
                "status": s["status"],
                "progress": s["progress_pct"],
            }
            for s in sorted(stages, key=lambda x: x["order"])[:6]
        ],
    }


# ---- Domain lists (filter by project_id) ----
def _project_router(coll_name: str, model, dep=None):
    dep = dep or get_current_user
    async def lister(
        project_id: Optional[str] = None,
        limit: int = 500,
        skip: int = 0,
        user: User = Depends(dep),
    ):
        limit = max(1, min(limit, 500))
        skip = max(0, skip)
        q = {"project_id": project_id} if project_id else {}
        rows = await db[coll_name].find(q, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
        if coll_name == "stages":
            rows.sort(key=lambda r: r.get("order", 0))
        return [model(**r) for r in rows]
    return lister


router.add_api_route("/stages", _project_router("stages", Stage), response_model=List[Stage])
router.add_api_route("/boq", _project_router("boq", BOQItem, dep=require_finance), response_model=List[BOQItem])
router.add_api_route("/materials", _project_router("materials", Material, dep=require_internal), response_model=List[Material])
router.add_api_route("/site-reports", _project_router("reports", DailySiteReport), response_model=List[DailySiteReport])
router.add_api_route("/billing", _project_router("bills", ContractorBill, dep=require_finance), response_model=List[ContractorBill])
router.add_api_route("/quality", _project_router("quality", QualityCheck), response_model=List[QualityCheck])
router.add_api_route("/snags", _project_router("snags", Snag), response_model=List[Snag])
router.add_api_route("/approvals", _project_router("approvals", Approval), response_model=List[Approval])


# Team list with PII scrubbing for CLIENT role
@router.get("/team", response_model=List[TeamMember])
async def list_team(
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    q = {"project_id": project_id} if project_id else {}
    rows = await db.team.find(q, {"_id": 0}).to_list(500)
    if user.role == "CLIENT":
        # Mask direct contact details to protect contractor relationships
        for r in rows:
            r["phone"] = "—"
            r["email"] = "—"
    return [TeamMember(**r) for r in rows]


# ---- Write endpoints ----
@router.post("/site-reports", response_model=DailySiteReport)
async def create_site_report(body: SiteReportCreate, user: User = Depends(require_roles(WRITE_STAGE_ROLES))):
    rec = DailySiteReport(id=str(uuid.uuid4()), submitted_by=user.full_name, **body.dict())
    await db.reports.insert_one(rec.dict())
    return rec


@router.patch("/stages/{stage_id}", response_model=Stage)
async def update_stage(stage_id: str, body: StageUpdate, user: User = Depends(require_roles(WRITE_STAGE_ROLES))):
    update = {k: v for k, v in body.dict().items() if v is not None}
    await db.stages.update_one({"id": stage_id}, {"$set": update})
    doc = await db.stages.find_one({"id": stage_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Stage not found")
    return Stage(**doc)


@router.patch("/quality/{qc_id}", response_model=QualityCheck)
async def update_quality(qc_id: str, body: QualityToggle, user: User = Depends(require_roles(WRITE_QUALITY_ROLES))):
    await db.quality.update_one({"id": qc_id}, {"$set": body.dict(exclude_none=True)})
    doc = await db.quality.find_one({"id": qc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quality check not found")
    return QualityCheck(**doc)


@router.patch("/snags/{snag_id}", response_model=Snag)
async def update_snag(snag_id: str, body: SnagUpdate, user: User = Depends(require_internal)):
    payload = {k: v for k, v in body.dict().items() if v is not None}
    await db.snags.update_one({"id": snag_id}, {"$set": payload})
    doc = await db.snags.find_one({"id": snag_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Snag not found")
    return Snag(**doc)
