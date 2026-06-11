"""Pydantic models for the Regal Park Villas API."""
from typing import List, Optional

from pydantic import BaseModel, EmailStr

ROLES = [
    "ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "ARCHITECT",
    "STRUCTURAL_ENGINEER", "MEP_CONSULTANT", "INTERIOR_DESIGNER",
    "LANDSCAPE_ARCHITECT", "PLANNING_ENGINEER", "QUANTITY_SURVEYOR",
    "PROCUREMENT_MANAGER", "SITE_ENGINEER", "SAFETY_OFFICER",
    "STORE_KEEPER", "ACCOUNTANT", "CONTRACTOR", "CLIENT", "CRM_SALES",
]


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
    photos: List[str] = []  # /api/files/{id} URLs


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


class QualityToggle(BaseModel):
    result: str
    remarks: Optional[str] = None


class Snag(BaseModel):
    id: str
    project_id: str
    room: str
    issue: str
    category: str
    assigned_contractor: str
    deadline: str
    status: str  # OPEN / IN_PROGRESS / RESOLVED
    photos: List[str] = []  # /api/files/{id} URLs


class SnagUpdate(BaseModel):
    status: Optional[str] = None
    photos: Optional[List[str]] = None


class StageUpdate(BaseModel):
    progress_pct: float
    status: str
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    remarks: Optional[str] = None


class Document(BaseModel):
    id: str
    project_id: str
    title: str
    category: str  # ARCHITECTURAL / STRUCTURAL / MEP / INTERIOR / LANDSCAPE / AGREEMENT / INVOICE / WARRANTY / OTHER
    drawing_number: Optional[str] = None
    revision: str = "R0"
    uploaded_by: str
    uploaded_at: str
    file_url: str = ""  # /api/files/{id}
    file_name: str


class DocumentCreate(BaseModel):
    project_id: str
    title: str
    category: str
    drawing_number: Optional[str] = None
    revision: str = "R0"
    file_url: str
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


class Plot(BaseModel):
    id: str
    plot_no: int
    villa_type: str  # Elora / Selora / Avira / Riora
    dimension_ft: str  # e.g. "40 x 50"
    status: str  # AVAILABLE / SOLD / UNDER_CONSTRUCTION / COMPLETED
    project_id: Optional[str] = None


# ---- Procurement: Purchase Orders ----
class POHistoryEntry(BaseModel):
    status: str
    by: str
    at: str
    note: Optional[str] = None


class PurchaseOrder(BaseModel):
    id: str
    project_id: str
    po_number: str
    material_name: str
    vendor: str
    quantity: float
    unit: str
    rate_inr: float
    total_inr: float
    status: str  # REQUESTED / APPROVED / ORDERED / DELIVERED / CANCELLED
    requested_by: str
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    history: List[POHistoryEntry] = []


class PurchaseOrderCreate(BaseModel):
    project_id: str
    material_name: str
    vendor: str
    quantity: float
    unit: str
    rate_inr: float
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None


class POTransition(BaseModel):
    action: str  # approve / order / deliver / cancel
    note: Optional[str] = None


# ---- Approval workflow requests ----
class ApprovalRequest(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    category: str  # DESIGN / MATERIAL / BUDGET / STAGE_SIGNOFF / CLIENT_SELECTION / OTHER
    requested_by: str
    assignee_role: str
    status: str = "PENDING"  # PENDING / APPROVED / REJECTED
    decision_by: Optional[str] = None
    decision_note: Optional[str] = None
    created_at: str
    decided_at: Optional[str] = None


class ApprovalRequestCreate(BaseModel):
    project_id: str
    title: str
    description: str
    category: str
    assignee_role: str


class ApprovalDecision(BaseModel):
    decision: str  # APPROVED / REJECTED
    note: Optional[str] = None


# ---- Stage quality checklists ----
class ChecklistItem(BaseModel):
    id: str
    text: str
    status: str = "PENDING"  # PENDING / PASS / FAIL
    checked_by: Optional[str] = None
    checked_at: Optional[str] = None
    remarks: Optional[str] = None


class ChecklistTemplate(BaseModel):
    id: str
    stage_name: str
    items: List[str]


class StageChecklist(BaseModel):
    id: str
    project_id: str
    stage_name: str
    items: List[ChecklistItem]
    signed_off: bool = False
    signed_off_by: Optional[str] = None
    signed_off_at: Optional[str] = None
    created_at: str


class StageChecklistCreate(BaseModel):
    project_id: str
    stage_name: str


class ChecklistItemUpdate(BaseModel):
    status: str  # PENDING / PASS / FAIL
    remarks: Optional[str] = None
