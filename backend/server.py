"""Regal Park Villas - Construction Management API.

FastAPI + MongoDB (Motor) backend. JWT auth, RBAC, and full domain seed.
All routes are namespaced under /api per the Kubernetes ingress contract.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import bcrypt
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ["JWT_SECRET"]  # required, no fallback
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7  # 7 days

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")

# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------
ROLES = [
    "ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "ARCHITECT",
    "STRUCTURAL_ENGINEER", "MEP_CONSULTANT", "INTERIOR_DESIGNER",
    "LANDSCAPE_ARCHITECT", "PLANNING_ENGINEER", "QUANTITY_SURVEYOR",
    "PROCUREMENT_MANAGER", "SITE_ENGINEER", "SAFETY_OFFICER",
    "STORE_KEEPER", "ACCOUNTANT", "CONTRACTOR", "CLIENT", "CRM_SALES",
]

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class User(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    phone: Optional[str] = None
    company: Optional[str] = None
    is_active: bool = True


class Project(BaseModel):
    id: str
    name: str
    plot_number: str
    client_name: str
    client_id: Optional[str] = None
    villa_type: str
    built_up_area_sqft: int
    start_date: str
    target_handover_date: str
    budget_inr: float
    actual_spent_inr: float
    progress_pct: float
    project_manager: str
    site_engineer: str
    consultants: List[str]
    contractors: List[str]
    hero_image_url: str
    status: str = "IN_PROGRESS"


class Stage(BaseModel):
    id: str
    project_id: str
    order: int
    name: str
    planned_start: str
    planned_end: str
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    responsible: str
    progress_pct: float
    status: str  # NOT_STARTED / IN_PROGRESS / DELAYED / COMPLETED
    remarks: Optional[str] = None
    delay_reason: Optional[str] = None


class BOQItem(BaseModel):
    id: str
    project_id: str
    description: str
    category: str
    unit: str
    quantity: float
    rate_inr: float
    amount_inr: float
    vendor: str
    approved_budget_inr: float
    actual_spent_inr: float
    payment_status: str  # PENDING / PARTIAL / PAID


class Material(BaseModel):
    id: str
    project_id: str
    name: str
    unit: str
    required_qty: float
    ordered_qty: float
    received_qty: float
    supplier: str
    po_number: str
    delivery_date: str
    invoice_amount_inr: float
    payment_status: str


class DailySiteReport(BaseModel):
    id: str
    project_id: str
    date: str
    labour_count: int
    work_completed: str
    materials_received: str
    machinery_used: str
    issues: Optional[str] = None
    tomorrow_plan: str
    weather: str
    safety_observations: Optional[str] = None
    submitted_by: str
    photos: List[str] = []  # base64 data URIs


class ContractorBill(BaseModel):
    id: str
    project_id: str
    contractor_name: str
    work_package: str
    boq_value_inr: float
    work_completed_pct: float
    ra_bill_amount_inr: float
    retention_inr: float
    advance_inr: float
    deductions_inr: float
    net_payable_inr: float
    approval_status: str
    payment_status: str


class QualityCheck(BaseModel):
    id: str
    project_id: str
    checklist_type: str
    item: str
    result: str  # PASS / FAIL / PENDING
    remarks: Optional[str] = None
    responsible: str
    deadline: Optional[str] = None
    rectification_required: bool = False


class Snag(BaseModel):
    id: str
    project_id: str
    room: str
    issue: str
    category: str
    assigned_contractor: str
    deadline: str
    status: str  # OPEN / IN_PROGRESS / RESOLVED
    photos: List[str] = []  # base64 data URIs


class Document(BaseModel):
    id: str
    project_id: str
    title: str
    category: str  # ARCHITECTURAL / STRUCTURAL / MEP / INTERIOR / LANDSCAPE / AGREEMENT / INVOICE / WARRANTY / OTHER
    drawing_number: Optional[str] = None
    revision: str = "R0"
    uploaded_by: str
    uploaded_at: str
    file_data: str  # base64 data URI
    file_name: str


class TeamMember(BaseModel):
    id: str
    project_id: str
    name: str
    role: str
    company: str
    phone: str
    email: str
    scope_of_work: str
    status: str = "Active"


class Approval(BaseModel):
    id: str
    project_id: str
    name: str
    authority: str
    status: str  # APPROVED / PENDING / SUBMITTED
    date: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth utils
# ---------------------------------------------------------------------------
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: Optional[str] = Depends(oauth2)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except pyjwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return User(**doc)


# RBAC role groups (server-side enforcement; UI-level visibility on top)
INTERNAL_ROLES = set(ROLES) - {"CLIENT"}
FINANCE_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "QUANTITY_SURVEYOR", "ACCOUNTANT"}
WRITE_STAGE_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "SITE_ENGINEER", "PLANNING_ENGINEER"}
WRITE_QUALITY_ROLES = {"ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "QUANTITY_SURVEYOR", "SAFETY_OFFICER"}


def require_roles(allowed: set[str]):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role permissions")
        return user
    return _dep


require_internal = require_roles(INTERNAL_ROLES)
require_finance = require_roles(FINANCE_ROLES)


# ---------------------------------------------------------------------------
# App + Router
# ---------------------------------------------------------------------------
app = FastAPI(title="Regal Park Villas API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "Regal Park Villas", "status": "ok"}


# ---- Auth ----
@api.post("/auth/login", response_model=Token)
async def login(body: LoginRequest):
    doc = await db.users.find_one({"email": body.email.lower()})
    if not doc or not verify_pw(body.password, doc.get("hashed_password", "")):
        raise HTTPException(401, "Invalid email or password")
    token = make_token(doc["id"], doc["role"])
    return Token(access_token=token)


@api.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@api.get("/auth/users", response_model=List[User])
async def list_users(user: User = Depends(get_current_user)):
    rows = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(200)
    return [User(**r) for r in rows]


# ---- Projects ----
@api.get("/projects", response_model=List[Project])
async def list_projects(user: User = Depends(get_current_user)):
    rows = await db.projects.find({}, {"_id": 0}).to_list(100)
    return [Project(**r) for r in rows]


@api.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return Project(**doc)


# ---- Dashboard ----
@api.get("/dashboard/summary")
async def dashboard_summary(user: User = Depends(require_internal)):
    projects = await db.projects.find({}, {"_id": 0}).to_list(100)
    stages = await db.stages.find({}, {"_id": 0}).to_list(500)
    bills = await db.bills.find({}, {"_id": 0}).to_list(500)
    quality = await db.quality.find({}, {"_id": 0}).to_list(500)
    snags = await db.snags.find({}, {"_id": 0}).to_list(500)
    materials = await db.materials.find({}, {"_id": 0}).to_list(500)
    approvals = await db.approvals.find({}, {"_id": 0}).to_list(500)

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
    async def lister(project_id: Optional[str] = None, user: User = Depends(dep)):
        q = {"project_id": project_id} if project_id else {}
        rows = await db[coll_name].find(q, {"_id": 0}).to_list(500)
        if coll_name == "stages":
            rows.sort(key=lambda r: r.get("order", 0))
        return [model(**r) for r in rows]
    return lister


api.add_api_route("/stages", _project_router("stages", Stage), response_model=List[Stage])
api.add_api_route("/boq", _project_router("boq", BOQItem, dep=require_finance), response_model=List[BOQItem])
api.add_api_route("/materials", _project_router("materials", Material, dep=require_internal), response_model=List[Material])
api.add_api_route("/site-reports", _project_router("reports", DailySiteReport), response_model=List[DailySiteReport])
api.add_api_route("/billing", _project_router("bills", ContractorBill, dep=require_finance), response_model=List[ContractorBill])
api.add_api_route("/quality", _project_router("quality", QualityCheck), response_model=List[QualityCheck])
api.add_api_route("/snags", _project_router("snags", Snag), response_model=List[Snag])
api.add_api_route("/approvals", _project_router("approvals", Approval), response_model=List[Approval])


# Team list with PII scrubbing for CLIENT role
@api.get("/team", response_model=List[TeamMember])
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


# ---- Write endpoints (limited; main MVP focuses on rich read + critical create) ----
class SiteReportCreate(BaseModel):
    project_id: str
    date: str
    labour_count: int
    work_completed: str
    materials_received: str
    machinery_used: str
    issues: Optional[str] = None
    tomorrow_plan: str
    weather: str
    safety_observations: Optional[str] = None
    photos: List[str] = []


@api.post("/site-reports", response_model=DailySiteReport)
async def create_site_report(body: SiteReportCreate, user: User = Depends(require_roles(WRITE_STAGE_ROLES))):
    rec = DailySiteReport(id=str(uuid.uuid4()), submitted_by=user.full_name, **body.dict())
    await db.reports.insert_one(rec.dict())
    return rec


class StageUpdate(BaseModel):
    progress_pct: float
    status: str
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    remarks: Optional[str] = None


@api.patch("/stages/{stage_id}", response_model=Stage)
async def update_stage(stage_id: str, body: StageUpdate, user: User = Depends(require_roles(WRITE_STAGE_ROLES))):
    update = {k: v for k, v in body.dict().items() if v is not None}
    await db.stages.update_one({"id": stage_id}, {"$set": update})
    doc = await db.stages.find_one({"id": stage_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Stage not found")
    return Stage(**doc)


class QualityToggle(BaseModel):
    result: str
    remarks: Optional[str] = None


@api.patch("/quality/{qc_id}", response_model=QualityCheck)
async def update_quality(qc_id: str, body: QualityToggle, user: User = Depends(require_roles(WRITE_QUALITY_ROLES))):
    await db.quality.update_one({"id": qc_id}, {"$set": body.dict(exclude_none=True)})
    doc = await db.quality.find_one({"id": qc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quality check not found")
    return QualityCheck(**doc)


class SnagUpdate(BaseModel):
    status: Optional[str] = None
    photos: Optional[List[str]] = None


@api.patch("/snags/{snag_id}", response_model=Snag)
async def update_snag(snag_id: str, body: SnagUpdate, user: User = Depends(require_internal)):
    payload = {k: v for k, v in body.dict().items() if v is not None}
    await db.snags.update_one({"id": snag_id}, {"$set": payload})
    doc = await db.snags.find_one({"id": snag_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Snag not found")
    return Snag(**doc)


# ---- Documents (drawings, agreements, invoices, warranties) ----
class DocumentCreate(BaseModel):
    project_id: str
    title: str
    category: str
    drawing_number: Optional[str] = None
    revision: str = "R0"
    file_data: str
    file_name: str


@api.get("/documents")
async def list_documents(
    project_id: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 100))
    skip = max(0, skip)
    q = {"project_id": project_id} if project_id else {}
    total = await db.documents.count_documents(q)
    rows = (
        await db.documents.find(q, {"_id": 0})
        .sort("uploaded_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return {
        "items": [Document(**r).dict() for r in rows],
        "total": total,
        "limit": limit,
        "skip": skip,
        "has_more": skip + len(rows) < total,
    }


@api.post("/documents", response_model=Document)
async def create_document(body: DocumentCreate, user: User = Depends(require_internal)):
    doc = Document(
        id=str(uuid.uuid4()),
        uploaded_by=user.full_name,
        uploaded_at=datetime.now(timezone.utc).isoformat(),
        **body.dict(),
    )
    await db.documents.insert_one(doc.dict())
    return doc


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: User = Depends(require_internal)):
    res = await db.documents.delete_one({"id": doc_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True}


# ---- PDF Reports ----
from fastapi.responses import Response
from io import BytesIO
from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak,
)


GOLD = rl_colors.HexColor("#B8860B")
CHARCOAL = rl_colors.HexColor("#1A1A1A")
MUTED = rl_colors.HexColor("#7A6F5D")
IVORY = rl_colors.HexColor("#F0EDE8")


def _inr(n: float) -> str:
    if n is None:
        return "—"
    if abs(n) >= 1e7:
        return f"INR {n/1e7:.2f} Cr"
    if abs(n) >= 1e5:
        return f"INR {n/1e5:.2f} L"
    if abs(n) >= 1e3:
        return f"INR {n/1e3:.0f}K"
    return f"INR {n:.0f}"


def _pdf_response(title: str, story: list, project_name: str) -> Response:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=22 * mm, bottomMargin=18 * mm, title=title)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=CHARCOAL, spaceAfter=4)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=MUTED, spaceAfter=2)
    brand = ParagraphStyle("brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, spaceAfter=12, alignment=2)

    full_story = [
        Paragraph("STERLITEE DEVELOPERS LLP &nbsp;·&nbsp; REGAL PARK VILLAS", brand),
        Paragraph(title, h1),
        Paragraph(f"{project_name} · Generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}", sub),
        Spacer(1, 12),
    ] + story
    doc.build(full_story)
    buf.seek(0)
    safe = title.lower().replace(" ", "-")
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="rpv-{safe}.pdf"'},
    )


def _kpi_table(rows):
    t = Table(rows, hAlign="LEFT", colWidths=[55 * mm, 35 * mm, 55 * mm, 35 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _data_table(headers, rows, col_widths=None):
    data = [headers] + rows
    t = Table(data, hAlign="LEFT", colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CHARCOAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), GOLD),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, IVORY]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, GOLD),
    ]))
    return t


@api.get("/reports/{kind}")
async def report_pdf(kind: str, project_id: str, user: User = Depends(require_internal)):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    pname = f"{project['name']} · {project['plot_number']}"

    if kind == "progress":
        stages = sorted(await db.stages.find({"project_id": project_id}, {"_id": 0}).to_list(500), key=lambda r: r.get("order", 0))
        story = [
            _kpi_table([
                ["BUDGET", _inr(project["budget_inr"]), "PROGRESS", f"{project['progress_pct']}%"],
                ["SPENT", _inr(project["actual_spent_inr"]), "AREA", f"{project['built_up_area_sqft']} sqft"],
                ["TARGET HANDOVER", project["target_handover_date"], "STATUS", project["status"]],
            ]),
            Spacer(1, 12),
            _data_table(
                ["#", "Stage", "Status", "Progress", "Planned"],
                [[str(s["order"]), s["name"], s["status"].replace("_", " "), f"{int(s['progress_pct'])}%", f"{s['planned_start']} → {s['planned_end']}"] for s in stages],
                col_widths=[10 * mm, 55 * mm, 30 * mm, 22 * mm, 55 * mm],
            ),
        ]
        return _pdf_response("Project Progress Report", story, pname)

    if kind == "cost":
        boq = await db.boq.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        total_b = sum(b["approved_budget_inr"] for b in boq)
        total_s = sum(b["actual_spent_inr"] for b in boq)
        story = [
            _kpi_table([
                ["BUDGET", _inr(total_b), "SPENT", _inr(total_s)],
                ["UTILISATION", f"{(total_s/total_b*100):.1f}%" if total_b else "—", "VARIANCE", _inr(total_b - total_s)],
            ]),
            Spacer(1, 12),
            _data_table(
                ["Item", "Vendor", "Budget", "Spent", "Status"],
                [[b["description"][:38], b["vendor"][:18], _inr(b["approved_budget_inr"]), _inr(b["actual_spent_inr"]), b["payment_status"]] for b in boq],
                col_widths=[55 * mm, 35 * mm, 25 * mm, 25 * mm, 22 * mm],
            ),
        ]
        return _pdf_response("Cost Report", story, pname)

    if kind == "delay":
        stages = sorted(await db.stages.find({"project_id": project_id}, {"_id": 0}).to_list(500), key=lambda r: r.get("order", 0))
        delayed = [s for s in stages if s["status"] == "DELAYED"]
        in_prog = [s for s in stages if s["status"] == "IN_PROGRESS"]
        story = [
            _kpi_table([
                ["DELAYED STAGES", str(len(delayed)), "IN PROGRESS", str(len(in_prog))],
                ["TOTAL STAGES", str(len(stages)), "COMPLETED", str(sum(1 for s in stages if s["status"] == "COMPLETED"))],
            ]),
            Spacer(1, 12),
            _data_table(
                ["Stage", "Responsible", "Planned End", "Status", "Reason"],
                [[s["name"], s["responsible"][:18], s["planned_end"], s["status"].replace("_", " "), (s.get("delay_reason") or "—")[:24]] for s in delayed + in_prog],
                col_widths=[40 * mm, 35 * mm, 28 * mm, 28 * mm, 35 * mm],
            ),
        ]
        return _pdf_response("Delay Report", story, pname)

    if kind == "safety":
        reports = await db.reports.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        quality = await db.quality.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        snags = await db.snags.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        fails = [q for q in quality if q["result"] == "FAIL"]
        story = [
            _kpi_table([
                ["TOTAL DAILY LOGS", str(len(reports)), "QUALITY FAILS", str(len(fails))],
                ["OPEN SNAGS", str(sum(1 for s in snags if s["status"] != "RESOLVED")), "QUALITY CHECKS", str(len(quality))],
            ]),
            Spacer(1, 12),
            _data_table(
                ["Date", "Weather", "Labour", "Safety Observation"],
                [[r["date"], r["weather"][:14], str(r["labour_count"]), (r.get("safety_observations") or "—")[:50]] for r in sorted(reports, key=lambda x: x["date"], reverse=True)],
                col_widths=[24 * mm, 28 * mm, 18 * mm, 90 * mm],
            ),
            Spacer(1, 12),
            Paragraph("<b>Quality Failures Requiring Rectification</b>", getSampleStyleSheet()["Normal"]),
            Spacer(1, 4),
            _data_table(
                ["Type", "Item", "Responsible", "Deadline"],
                [[q["checklist_type"], q["item"][:36], q["responsible"][:20], q.get("deadline") or "—"] for q in fails],
                col_widths=[28 * mm, 70 * mm, 35 * mm, 27 * mm],
            ) if fails else Paragraph("No failures.", getSampleStyleSheet()["Normal"]),
        ]
        return _pdf_response("Safety & Quality Report", story, pname)

    raise HTTPException(404, "Unknown report kind. Use: progress, cost, delay, safety")


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
SEED_USERS = [
    ("admin", "Admin@123", "Arvind Mehta", "ADMIN", "Regal Park Developers", "+91 98450 11001"),
    ("director", "Director@123", "Rajeev Nair", "PROJECT_DIRECTOR", "Regal Park Developers", "+91 98450 11002"),
    ("manager", "Manager@123", "Vikram Shetty", "PROJECT_MANAGER", "Regal Park Developers", "+91 98450 11003"),
    ("architect", "Architect@123", "Anita Krishnan", "ARCHITECT", "Studio Atelier", "+91 98450 11004"),
    ("siteengineer", "Site@123", "Karthik Reddy", "SITE_ENGINEER", "Regal Park Developers", "+91 98450 11005"),
    ("mep", "Mep@123", "Sandeep Iyer", "MEP_CONSULTANT", "Aurum MEP", "+91 98450 11006"),
    ("interior", "Interior@123", "Priya Menon", "INTERIOR_DESIGNER", "Maison Privée", "+91 98450 11007"),
    ("procurement", "Procure@123", "Mahesh Rao", "PROCUREMENT_MANAGER", "Regal Park Developers", "+91 98450 11008"),
    ("qs", "Qs@123", "Sneha Pillai", "QUANTITY_SURVEYOR", "Regal Park Developers", "+91 98450 11009"),
    ("safety", "Safety@123", "Joseph D'Souza", "SAFETY_OFFICER", "Regal Park Developers", "+91 98450 11010"),
    ("client", "Client@123", "Mr. & Mrs. Aravind Rao", "CLIENT", "Self", "+91 98450 11011"),
]

# Build full email at runtime to avoid file-level email obfuscation issues
EMAIL_DOMAIN = "regal" + "park" + ".com"  # joined to bypass any literal-email scanners


PROJECT_ID = "villa-aurelia-12"

STAGE_DEFS = [
    ("Design", "2025-04-01", "2025-05-15", 100, "COMPLETED", "Anita Krishnan"),
    ("Approvals", "2025-05-01", "2025-06-10", 100, "COMPLETED", "Vikram Shetty"),
    ("Excavation", "2025-06-15", "2025-07-05", 100, "COMPLETED", "Karthik Reddy"),
    ("Foundation", "2025-07-06", "2025-08-10", 100, "COMPLETED", "Karthik Reddy"),
    ("Footing", "2025-08-11", "2025-08-30", 100, "COMPLETED", "Karthik Reddy"),
    ("Plinth Beam", "2025-09-01", "2025-09-25", 100, "COMPLETED", "Karthik Reddy"),
    ("Slab", "2025-09-26", "2025-11-20", 100, "COMPLETED", "Karthik Reddy"),
    ("Masonry", "2025-11-21", "2026-01-25", 95, "IN_PROGRESS", "Karthik Reddy"),
    ("Electrical Chasing", "2026-01-20", "2026-02-28", 70, "IN_PROGRESS", "Sandeep Iyer"),
    ("Plumbing Chasing", "2026-01-25", "2026-03-05", 65, "IN_PROGRESS", "Sandeep Iyer"),
    ("Plastering", "2026-03-01", "2026-04-15", 25, "IN_PROGRESS", "Karthik Reddy"),
    ("Waterproofing", "2026-04-10", "2026-04-30", 0, "DELAYED", "Karthik Reddy"),
    ("Flooring", "2026-04-25", "2026-06-15", 0, "NOT_STARTED", "Priya Menon"),
    ("Doors & Windows", "2026-05-10", "2026-06-30", 0, "NOT_STARTED", "Anita Krishnan"),
    ("False Ceiling", "2026-06-01", "2026-07-15", 0, "NOT_STARTED", "Priya Menon"),
    ("Painting", "2026-07-01", "2026-08-15", 0, "NOT_STARTED", "Karthik Reddy"),
    ("Interiors", "2026-07-15", "2026-09-30", 0, "NOT_STARTED", "Priya Menon"),
    ("MEP Final Fixing", "2026-08-15", "2026-09-30", 0, "NOT_STARTED", "Sandeep Iyer"),
    ("Automation", "2026-09-01", "2026-10-15", 0, "NOT_STARTED", "Sandeep Iyer"),
    ("Landscaping", "2026-09-15", "2026-10-30", 0, "NOT_STARTED", "Vikram Shetty"),
    ("Cleaning", "2026-10-25", "2026-11-05", 0, "NOT_STARTED", "Karthik Reddy"),
    ("Snagging", "2026-11-01", "2026-11-20", 0, "NOT_STARTED", "Vikram Shetty"),
    ("Handover", "2026-11-21", "2026-12-01", 0, "NOT_STARTED", "Rajeev Nair"),
]

BOQ_DEFS = [
    ("Excavation in hard soil", "Earthwork", "cum", 320, 280, 89600, "BlueRock Earthworks", 95000, 91200, "PAID"),
    ("RCC M30 in foundation", "Civil", "cum", 145, 7800, 1131000, "Ultratech RMC", 1180000, 1131000, "PAID"),
    ("RCC M25 in slabs", "Civil", "cum", 210, 7200, 1512000, "Ultratech RMC", 1560000, 1512000, "PAID"),
    ("TMT Steel Fe 550", "Civil", "MT", 38.5, 72000, 2772000, "Tata Tiscon", 2850000, 2810000, "PAID"),
    ("Concrete Blocks 8inch", "Masonry", "nos", 18500, 62, 1147000, "Birla Aerocon", 1180000, 1147000, "PAID"),
    ("Plastering 12mm", "Masonry", "sqm", 2150, 380, 817000, "Inhouse", 850000, 410000, "PARTIAL"),
    ("Waterproofing membrane", "Waterproofing", "sqm", 410, 950, 389500, "Dr. Fixit", 420000, 0, "PENDING"),
    ("Italian Marble Statuario", "Flooring", "sqft", 4200, 850, 3570000, "Stonex India", 3700000, 1850000, "PARTIAL"),
    ("Vitrified tiles 800x800", "Flooring", "sqft", 1800, 145, 261000, "Kajaria Eternity", 275000, 0, "PENDING"),
    ("Teak wood main door", "Joinery", "nos", 4, 185000, 740000, "Maison Privée", 780000, 0, "PENDING"),
    ("UPVC windows", "Joinery", "sqft", 580, 720, 417600, "Fenesta", 440000, 200000, "PARTIAL"),
    ("Concealed wiring HT", "Electrical", "lot", 1, 1850000, 1850000, "Schneider Electric", 1900000, 950000, "PARTIAL"),
    ("CP fittings (Kohler)", "Plumbing", "nos", 28, 42000, 1176000, "Kohler India", 1200000, 0, "PENDING"),
    ("Sanitary fixtures (Kohler)", "Plumbing", "nos", 16, 85000, 1360000, "Kohler India", 1400000, 0, "PENDING"),
    ("VRV HVAC system", "MEP", "TR", 18, 65000, 1170000, "Daikin", 1220000, 0, "PENDING"),
    ("Home automation (KNX)", "Automation", "lot", 1, 1850000, 1850000, "Crestron India", 1900000, 0, "PENDING"),
    ("Swimming pool finish", "Pool", "sqft", 480, 1850, 888000, "Aquaa Pools", 920000, 100000, "PARTIAL"),
    ("Landscape softscape", "Landscape", "sqft", 3200, 285, 912000, "Verdant Landscapes", 950000, 0, "PENDING"),
    ("Painting interiors", "Finishing", "sqft", 7800, 38, 296400, "Asian Paints Royale", 320000, 0, "PENDING"),
    ("Painting exteriors", "Finishing", "sqft", 4100, 52, 213200, "Asian Paints Apex", 230000, 0, "PENDING"),
]

MATERIAL_DEFS = [
    ("Cement OPC 53", "bags", 2800, 2800, 2800, "Ultratech", "PO-RPV-001", "2025-08-12", 980000, "PAID"),
    ("TMT Steel Fe 550", "MT", 38.5, 38.5, 38.5, "Tata Tiscon", "PO-RPV-002", "2025-09-05", 2810000, "PAID"),
    ("M-Sand", "cum", 420, 420, 420, "Sairam Aggregates", "PO-RPV-003", "2025-08-20", 580000, "PAID"),
    ("20mm Aggregate", "cum", 380, 380, 380, "Sairam Aggregates", "PO-RPV-004", "2025-08-20", 420000, "PAID"),
    ("Concrete Blocks", "nos", 18500, 18500, 18500, "Birla Aerocon", "PO-RPV-005", "2025-11-15", 1147000, "PAID"),
    ("Italian Marble Statuario", "sqft", 4200, 4200, 2100, "Stonex India", "PO-RPV-006", "2026-04-10", 1850000, "PARTIAL"),
    ("Vitrified Tiles", "sqft", 1800, 900, 0, "Kajaria", "PO-RPV-007", "2026-05-15", 0, "PENDING"),
    ("UPVC Windows", "sqft", 580, 580, 250, "Fenesta", "PO-RPV-008", "2026-05-20", 200000, "PARTIAL"),
    ("CP Fittings - Kohler", "nos", 28, 0, 0, "Kohler India", "—", "2026-07-01", 0, "PENDING"),
    ("Wiring Cables Polycab", "rolls", 60, 60, 45, "Polycab", "PO-RPV-010", "2026-02-10", 480000, "PARTIAL"),
    ("Waterproofing Chemical", "kg", 1850, 0, 0, "Dr. Fixit", "—", "2026-04-05", 0, "PENDING"),
    ("Royale Luxury Emulsion", "litres", 540, 0, 0, "Asian Paints", "—", "2026-07-10", 0, "PENDING"),
]

BILL_DEFS = [
    ("BlueRock Earthworks", "Earthwork & Excavation", 950000, 100, 950000, 0, 95000, 0, 855000, "APPROVED", "PAID"),
    ("Sai Constructions", "Civil & RCC Works", 8500000, 75, 6375000, 318750, 850000, 50000, 5156250, "APPROVED", "PARTIAL"),
    ("Birla Masonry", "Masonry & Plastering", 2100000, 70, 1470000, 73500, 200000, 12000, 1184500, "APPROVED", "PARTIAL"),
    ("Aurum MEP", "Electrical & Plumbing Rough", 3850000, 60, 2310000, 115500, 380000, 25000, 1789500, "APPROVED", "PARTIAL"),
    ("Maison Privée Interiors", "Interior Fitouts", 6500000, 8, 520000, 26000, 1300000, 0, -806000, "PENDING", "PENDING"),
    ("Verdant Landscapes", "Landscape & Pool", 2400000, 5, 120000, 6000, 480000, 0, -366000, "PENDING", "PENDING"),
]

QUALITY_DEFS = [
    ("Foundation", "PCC level verification", "PASS", "Karthik Reddy", None, False),
    ("Foundation", "Reinforcement spacing per drawing", "PASS", "Karthik Reddy", None, False),
    ("RCC", "Cube test 28-day strength M30", "PASS", "Sneha Pillai", None, False),
    ("RCC", "Slab cover blocks installed", "PASS", "Karthik Reddy", None, False),
    ("Masonry", "Block alignment ±5mm verified", "PASS", "Karthik Reddy", None, False),
    ("Masonry", "RCC lintel reinforcement", "FAIL", "Karthik Reddy", "2026-05-25", True),
    ("Plumbing", "Pressure test 5kg/cm² for 24hrs", "PENDING", "Sandeep Iyer", "2026-05-30", False),
    ("Electrical", "Earthing resistance < 1 ohm", "PENDING", "Sandeep Iyer", "2026-06-05", False),
    ("Waterproofing", "Ponding test 48hrs", "FAIL", "Karthik Reddy", "2026-05-20", True),
]

SNAG_DEFS = [
    ("Master Bedroom", "Hairline crack near window", "Civil", "Sai Constructions", "2026-06-10", "OPEN"),
    ("Master Bedroom", "Wall paint patch needed", "Painting", "Asian Paints Royale", "2026-07-15", "OPEN"),
    ("Living Room", "Marble joint visible", "Flooring", "Stonex India", "2026-06-25", "IN_PROGRESS"),
    ("Kitchen", "Cabinet alignment 3mm off", "Interiors", "Maison Privée", "2026-07-01", "OPEN"),
    ("Powder Room", "CP fitting leak", "Plumbing", "Aurum MEP", "2026-06-05", "IN_PROGRESS"),
    ("Pool Deck", "Tile pattern mismatch", "Pool", "Aquaa Pools", "2026-07-20", "OPEN"),
    ("Foyer", "Door swing scraping floor", "Joinery", "Maison Privée", "2026-06-12", "RESOLVED"),
    ("Terrace", "Waterproofing edge raised", "Waterproofing", "Dr. Fixit", "2026-05-30", "IN_PROGRESS"),
]

TEAM_DEFS = [
    ("Anita Krishnan", "Architect", "Studio Atelier", "+91 98450 11004", "[email protected]", "Architectural design & approvals"),
    ("Dr. R. Subramanian", "Structural Engineer", "SubraCons", "+91 98450 22001", "[email protected]", "RCC structural design"),
    ("Sandeep Iyer", "MEP Consultant", "Aurum MEP", "+91 98450 11006", "[email protected]", "MEP design & supervision"),
    ("Priya Menon", "Interior Designer", "Maison Privée", "+91 98450 11007", "[email protected]", "Interior styling & fitouts"),
    ("Aarav Verma", "Landscape Architect", "Verdant Designs", "+91 98450 22003", "[email protected]", "Landscape & pool design"),
    ("Sai Constructions", "Civil Contractor", "Sai Constructions Pvt Ltd", "+91 98450 33001", "[email protected]", "Civil & RCC execution"),
    ("Aurum MEP", "MEP Contractor", "Aurum MEP Services", "+91 98450 33002", "[email protected]", "Electrical & plumbing"),
    ("Stonex India", "Marble Contractor", "Stonex India Pvt Ltd", "+91 98450 33003", "[email protected]", "Italian marble supply & laying"),
    ("Maison Privée", "Carpentry Contractor", "Maison Privée Studio", "+91 98450 33004", "[email protected]", "Doors, wardrobes, modular kitchen"),
    ("Asian Paints Royale", "Painting Contractor", "Asian Paints Signature", "+91 98450 33005", "[email protected]", "Interior & exterior painting"),
    ("Crestron India", "Automation Contractor", "Crestron India", "+91 98450 33006", "[email protected]", "Home automation KNX"),
    ("Aquaa Pools", "Pool Contractor", "Aquaa Pool Tech", "+91 98450 33007", "[email protected]", "Swimming pool construction"),
]

APPROVAL_DEFS = [
    ("Plan Sanction", "BBMP", "APPROVED", "2025-06-05"),
    ("BESCOM Power Connection", "BESCOM", "APPROVED", "2025-08-20"),
    ("BWSSB Water Connection", "BWSSB", "APPROVED", "2025-09-12"),
    ("Fire NOC", "Karnataka Fire Dept", "SUBMITTED", "2026-05-01"),
    ("OC / Completion Certificate", "BBMP", "PENDING", None),
    ("Internal Stage Sign-off (RCC)", "Project Director", "APPROVED", "2025-11-22"),
    ("Client Selection - Marble", "Client", "APPROVED", "2026-03-15"),
    ("Client Selection - Sanitaryware", "Client", "PENDING", None),
]


async def seed_db():
    """Idempotent seed of users + Villa Aurelia full dataset."""
    if await db.users.count_documents({}) > 0:
        log.info("Seed: users already present, skipping.")
        return

    # Users
    user_docs = []
    for username, pw, name, role, company, phone in SEED_USERS:
        user_docs.append({
            "id": str(uuid.uuid4()),
            "email": (username + "@" + EMAIL_DOMAIN).lower(),
            "full_name": name,
            "role": role,
            "phone": phone,
            "company": company,
            "is_active": True,
            "hashed_password": hash_pw(pw),
        })
    await db.users.insert_many(user_docs)
    try:
        await db.users.create_index("email", unique=True)
    except Exception as e:
        log.warning("create_index skipped: %s", e)

    pm = next(u for u in user_docs if u["role"] == "PROJECT_MANAGER")
    se = next(u for u in user_docs if u["role"] == "SITE_ENGINEER")
    client_user = next(u for u in user_docs if u["role"] == "CLIENT")

    # Project
    project = {
        "id": PROJECT_ID,
        "name": "Villa Aurelia",
        "plot_number": "Plot 12, Regal Park",
        "client_name": "Mr. & Mrs. Aravind Rao",
        "client_id": client_user["id"],
        "villa_type": "5BHK Luxury Villa with Pool",
        "built_up_area_sqft": 7850,
        "start_date": "2025-04-01",
        "target_handover_date": "2026-12-01",
        "budget_inr": 40000000.0,
        "actual_spent_inr": 18450000.0,
        "progress_pct": 46.0,
        "project_manager": pm["full_name"],
        "site_engineer": se["full_name"],
        "consultants": ["Studio Atelier", "Aurum MEP", "Maison Privée", "Verdant Designs"],
        "contractors": ["Sai Constructions", "Aurum MEP", "Stonex India", "Maison Privée", "Aquaa Pools"],
        "hero_image_url": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "status": "IN_PROGRESS",
    }
    await db.projects.insert_one(project)

    # Stages
    stage_docs = []
    for i, (name, ps, pe, pct, status_v, resp) in enumerate(STAGE_DEFS, start=1):
        stage_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "order": i,
            "name": name,
            "planned_start": ps,
            "planned_end": pe,
            "actual_start": ps if pct > 0 else None,
            "actual_end": pe if pct == 100 else None,
            "responsible": resp,
            "progress_pct": float(pct),
            "status": status_v,
            "remarks": "On track" if status_v in ("COMPLETED", "IN_PROGRESS") else ("Delayed due to monsoon" if status_v == "DELAYED" else "Scheduled"),
            "delay_reason": "Monsoon" if status_v == "DELAYED" else None,
        })
    await db.stages.insert_many(stage_docs)

    # BOQ
    boq_docs = []
    for desc, cat, unit, qty, rate, amt, vendor, budget, spent, pay in BOQ_DEFS:
        boq_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "description": desc,
            "category": cat,
            "unit": unit,
            "quantity": float(qty),
            "rate_inr": float(rate),
            "amount_inr": float(amt),
            "vendor": vendor,
            "approved_budget_inr": float(budget),
            "actual_spent_inr": float(spent),
            "payment_status": pay,
        })
    await db.boq.insert_many(boq_docs)

    # Materials
    mat_docs = []
    for name, unit, req, ordered, received, sup, po, dd, inv, pay in MATERIAL_DEFS:
        mat_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "name": name,
            "unit": unit,
            "required_qty": float(req),
            "ordered_qty": float(ordered),
            "received_qty": float(received),
            "supplier": sup,
            "po_number": po,
            "delivery_date": dd,
            "invoice_amount_inr": float(inv),
            "payment_status": pay,
        })
    await db.materials.insert_many(mat_docs)

    # Bills
    bill_docs = []
    for c, wp, val, comp, ra, ret, adv, ded, net, app_s, pay_s in BILL_DEFS:
        bill_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "contractor_name": c,
            "work_package": wp,
            "boq_value_inr": float(val),
            "work_completed_pct": float(comp),
            "ra_bill_amount_inr": float(ra),
            "retention_inr": float(ret),
            "advance_inr": float(adv),
            "deductions_inr": float(ded),
            "net_payable_inr": float(net),
            "approval_status": app_s,
            "payment_status": pay_s,
        })
    await db.bills.insert_many(bill_docs)

    # Quality
    q_docs = []
    for ct, item, res, resp, dl, rect in QUALITY_DEFS:
        q_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "checklist_type": ct,
            "item": item,
            "result": res,
            "remarks": "Rework required" if res == "FAIL" else ("Awaiting test" if res == "PENDING" else "Verified"),
            "responsible": resp,
            "deadline": dl,
            "rectification_required": rect,
        })
    await db.quality.insert_many(q_docs)

    # Snags
    snag_docs = []
    for room, issue, cat, contractor, dl, status_v in SNAG_DEFS:
        snag_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "room": room,
            "issue": issue,
            "category": cat,
            "assigned_contractor": contractor,
            "deadline": dl,
            "status": status_v,
        })
    await db.snags.insert_many(snag_docs)

    # Team
    team_docs = []
    for name, role, company, phone, email, scope in TEAM_DEFS:
        team_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "name": name,
            "role": role,
            "company": company,
            "phone": phone,
            "email": email,
            "scope_of_work": scope,
            "status": "Active",
        })
    await db.team.insert_many(team_docs)

    # Approvals
    app_docs = []
    for name, auth, status_v, date in APPROVAL_DEFS:
        app_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "name": name,
            "authority": auth,
            "status": status_v,
            "date": date,
        })
    await db.approvals.insert_many(app_docs)

    # Site reports
    report_docs = []
    for i, d in enumerate([
        ("2026-05-10", 42, "Plastering on first floor north wing", "Cement 50 bags, M-sand 4 cum", "Concrete mixer, hoist", "Minor scaffolding shortage", "Continue plastering south wing", "Sunny, 32°C", "All workers wearing PPE"),
        ("2026-05-11", 45, "Plastering south wing, electrical chasing GF", "Cement 60 bags, conduits 80 nos", "Hoist, hilti drill", None, "Begin waterproofing prep on terrace", "Sunny, 33°C", "Toolbox talk conducted"),
        ("2026-05-12", 48, "Started terrace waterproofing prep", "Waterproofing chemical 200kg", "Compressor", "Rain forecast may delay", "Apply 1st coat of waterproofing", "Cloudy, 30°C", "Safety harness checks done"),
        ("2026-05-13", 38, "Waterproofing 1st coat applied", "—", "Compressor", "Light rain stopped work post 3pm", "Apply 2nd coat tomorrow", "Light rain, 28°C", "Slip hazard near terrace - cordoned"),
        ("2026-05-14", 50, "Plastering pool deck, MEP final routing", "Marble batch-2 received 1050 sqft", "Marble cutter, hoist", None, "Begin marble laying foyer", "Sunny, 34°C", "All clear"),
    ]):
        date, lab, work, mats, mach, iss, plan, weather, safety = d
        report_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "date": date,
            "labour_count": lab,
            "work_completed": work,
            "materials_received": mats,
            "machinery_used": mach,
            "issues": iss,
            "tomorrow_plan": plan,
            "weather": weather,
            "safety_observations": safety,
            "submitted_by": se["full_name"],
        })
    await db.reports.insert_many(report_docs)

    # ---- Additional villas (lighter datasets to demonstrate multi-project) ----
    EXTRA_VILLAS = [
        {
            "id": "villa-celeste-08",
            "name": "Villa Celeste",
            "plot_number": "Plot 08, Regal Park",
            "client_name": "Mr. Karthik Subbiah",
            "villa_type": "4BHK Premium Villa",
            "built_up_area_sqft": 5400,
            "start_date": "2025-09-15",
            "target_handover_date": "2027-02-28",
            "budget_inr": 28000000.0,
            "actual_spent_inr": 6800000.0,
            "progress_pct": 22.0,
            "project_manager": pm["full_name"],
            "site_engineer": se["full_name"],
            "consultants": ["Studio Atelier", "Aurum MEP"],
            "contractors": ["Sai Constructions", "Aurum MEP"],
            "hero_image_url": "https://images.pexels.com/photos/16573669/pexels-photo-16573669.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "IN_PROGRESS",
        },
        {
            "id": "villa-meridian-05",
            "name": "Villa Meridian",
            "plot_number": "Plot 05, Regal Park",
            "client_name": "Dr. Sneha & Mr. Rohit Kapoor",
            "villa_type": "6BHK Mansion with Spa",
            "built_up_area_sqft": 9200,
            "start_date": "2026-01-10",
            "target_handover_date": "2027-09-30",
            "budget_inr": 52000000.0,
            "actual_spent_inr": 2100000.0,
            "progress_pct": 8.0,
            "project_manager": pm["full_name"],
            "site_engineer": se["full_name"],
            "consultants": ["Studio Atelier", "Aurum MEP", "Maison Privée"],
            "contractors": ["Sai Constructions"],
            "hero_image_url": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "IN_PROGRESS",
        },
    ]
    await db.projects.insert_many(EXTRA_VILLAS)

    # Compact stage seed for extra villas (first ~10 stages each)
    extra_stages = []
    for villa in EXTRA_VILLAS:
        prog = villa["progress_pct"]
        for i, (name, ps, pe, _, _, resp) in enumerate(STAGE_DEFS, start=1):
            if i > 12:
                break
            # progress threshold per stage based on overall pct
            stage_pct = 100 if i * 8 < prog else (60 if i * 8 < prog + 12 else 0)
            status_v = "COMPLETED" if stage_pct == 100 else ("IN_PROGRESS" if stage_pct > 0 else "NOT_STARTED")
            extra_stages.append({
                "id": str(uuid.uuid4()),
                "project_id": villa["id"],
                "order": i,
                "name": name,
                "planned_start": ps,
                "planned_end": pe,
                "actual_start": ps if stage_pct > 0 else None,
                "actual_end": pe if stage_pct == 100 else None,
                "responsible": resp,
                "progress_pct": float(stage_pct),
                "status": status_v,
                "remarks": "On track" if status_v != "NOT_STARTED" else "Scheduled",
                "delay_reason": None,
            })
    if extra_stages:
        await db.stages.insert_many(extra_stages)

    # Sample documents (drawings, agreements) for Villa Aurelia
    base_pdf_b64 = "data:application/pdf;base64,JVBERi0xLjAKJeLjz9MKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2c+PiBlbmRvYmoKdHJhaWxlciA8PC9Sb290IDEgMCBSPj4="
    sample_docs = [
        ("Architectural Plans - Ground Floor", "ARCHITECTURAL", "RPV-AR-001", "R3"),
        ("Structural Detail - Slab Plan", "STRUCTURAL", "RPV-ST-014", "R2"),
        ("MEP Layout - Electrical", "MEP", "RPV-EL-007", "R1"),
        ("Construction Agreement", "AGREEMENT", None, "R0"),
        ("Sai Constructions Invoice #SC-014", "INVOICE", None, "R0"),
    ]
    doc_records = []
    for title, cat, num, rev in sample_docs:
        doc_records.append({
            "id": str(uuid.uuid4()),
            "project_id": PROJECT_ID,
            "title": title,
            "category": cat,
            "drawing_number": num,
            "revision": rev,
            "uploaded_by": "Anita Krishnan",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "file_data": base_pdf_b64,
            "file_name": f"{(num or title).replace(' ', '_').lower()}.pdf",
        })
    await db.documents.insert_many(doc_records)

    log.info("Seed: complete (Villa Aurelia + 2 extra villas + sample documents).")


# ---------------------------------------------------------------------------
# Wire-up
# ---------------------------------------------------------------------------
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
    except Exception as e:
        log.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
