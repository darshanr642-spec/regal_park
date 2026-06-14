"""CRM Revenue Engine: Pricing, Leads, Site Visits, Quotations, Bookings.

All routes prefixed with /crm (mounted under /api by server.py).
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth_utils import (
    CRM_READ_ROLES,
    CRM_ROLES,
    SALES_MGMT_ROLES,
    get_current_user,
    get_user_flexible,
    require_roles,
)
from config import db
from auth_utils import hash_pw
from models import (
    BOOKING_STATUSES,
    LEAD_SOURCES,
    LEAD_STATUSES,
    MILESTONE_NAMES,
    SALES_STATUSES,
    ApprovalLevel,
    Booking,
    BookingApproval,
    BookingApprovalDecision,
    BookingCreate,
    BookingUpdate,
    CrmActivity,
    DiscountDecision,
    DiscountRequest,
    Lead,
    LeadCreate,
    LeadUpdate,
    PaymentMilestone,
    Plot,
    Pricing,
    PricingCreate,
    Quotation,
    QuotationCreate,
    SiteVisit,
    SiteVisitCreate,
    SiteVisitUpdate,
    User,
)

router = APIRouter(prefix="/crm", tags=["CRM"])

_now = lambda: datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────────────
#  PRICING
# ──────────────────────────────────────────────────────────────────────

@router.get("/pricing", response_model=List[Pricing])
async def list_pricing(user: User = Depends(require_roles(CRM_READ_ROLES))):
    """Current pricing table by elevation type."""
    rows = await db.pricing.find({"status": "ACTIVE"}, {"_id": 0}).to_list(20)
    if not rows:
        # Fallback: return all rows sorted by valid_from desc
        rows = await db.pricing.find({}, {"_id": 0}).sort("valid_from", -1).to_list(20)
    return [Pricing(**r) for r in rows]


@router.put("/pricing", response_model=Pricing)
async def upsert_pricing(body: PricingCreate, user: User = Depends(require_roles({"ADMIN"}))):
    """Create or update pricing for an elevation type.

    If pricing already exists for this elevation, expire the old one and insert new.
    """
    now = _now()
    # Expire current pricing for this elevation
    await db.pricing.update_many(
        {"elevation_type": body.elevation_type, "status": "ACTIVE"},
        {"$set": {"valid_until": now, "status": "EXPIRED"}},
    )
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "valid_from": body.valid_from or now,
        "status": body.status or "ACTIVE",
    }
    await db.pricing.insert_one({**doc, "_id": doc["id"]})
    return Pricing(**doc)


# ──────────────────────────────────────────────────────────────────────
#  LEADS
# ──────────────────────────────────────────────────────────────────────

@router.get("/leads", response_model=List[Lead])
async def list_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: User = Depends(require_roles(CRM_READ_ROLES)),
):
    """List leads with optional filters. CRM_SALES sees only their own leads."""
    filt: dict = {}
    if status:
        filt["status"] = status
    if source:
        filt["source"] = source
    if assigned_to:
        filt["assigned_to"] = assigned_to
    elif user.role == "CRM_SALES":
        # CRM_SALES only sees their own leads
        filt["assigned_to"] = user.id
    rows = await db.leads.find(filt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Lead(**r) for r in rows]


@router.post("/leads", response_model=Lead)
async def create_lead(body: LeadCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Capture a new lead (walk-in, referral, web form)."""
    if body.source not in LEAD_SOURCES:
        raise HTTPException(422, f"Invalid source. Must be one of: {LEAD_SOURCES}")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "status": "NEW",
        "assigned_to": user.id,
        "created_at": now,
        "updated_at": now,
    }
    await db.leads.insert_one({**doc, "_id": doc["id"]})

    # Auto-create activity
    await _log_activity(doc["id"], "NOTE", f"Lead created from {body.source}", user)

    return Lead(**doc)


@router.get("/leads/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, user: User = Depends(require_roles(CRM_READ_ROLES))):
    doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Lead not found")
    return Lead(**doc)


@router.patch("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, body: LeadUpdate, user: User = Depends(require_roles(CRM_ROLES))):
    """Update lead fields (status, notes, assignment, etc.)."""
    doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Lead not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in LEAD_STATUSES:
        raise HTTPException(422, f"Invalid status. Must be one of: {LEAD_STATUSES}")

    updates["updated_at"] = _now()
    await db.leads.update_one({"id": lead_id}, {"$set": updates})

    # Log status change as activity
    if "status" in updates:
        await _log_activity(
            lead_id, "NOTE",
            f"Status changed to {updates['status']}", user,
        )

    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return Lead(**updated)


@router.get("/leads/{lead_id}/timeline", response_model=List[CrmActivity])
async def lead_timeline(lead_id: str, user: User = Depends(require_roles(CRM_READ_ROLES))):
    """Full activity timeline for a lead."""
    rows = await db.crm_activities.find(
        {"lead_id": lead_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return [CrmActivity(**r) for r in rows]


# ──────────────────────────────────────────────────────────────────────
#  SITE VISITS
# ──────────────────────────────────────────────────────────────────────

@router.post("/site-visits", response_model=SiteVisit)
async def create_site_visit(body: SiteVisitCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Schedule a site visit for a lead."""
    lead = await db.leads.find_one({"id": body.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "conducted_by": user.full_name,
        "actual_at": None,
        "feedback": None,
        "follow_up_date": None,
        "photos": [],
        "created_at": now,
    }
    await db.site_visits.insert_one({**doc, "_id": doc["id"]})

    # Update lead status
    await db.leads.update_one(
        {"id": body.lead_id},
        {"$set": {"status": "SITE_VISIT_SCHEDULED", "updated_at": now}},
    )
    await _log_activity(
        body.lead_id, "MEETING",
        f"Site visit scheduled for {body.scheduled_at}", user,
    )
    return SiteVisit(**doc)


@router.get("/site-visits", response_model=List[SiteVisit])
async def list_site_visits(
    lead_id: Optional[str] = None,
    user: User = Depends(require_roles(CRM_READ_ROLES)),
):
    filt: dict = {}
    if lead_id:
        filt["lead_id"] = lead_id
    rows = await db.site_visits.find(filt, {"_id": 0}).sort("scheduled_at", -1).to_list(200)
    return [SiteVisit(**r) for r in rows]


@router.patch("/site-visits/{visit_id}", response_model=SiteVisit)
async def update_site_visit(
    visit_id: str,
    body: SiteVisitUpdate,
    user: User = Depends(require_roles(CRM_ROLES)),
):
    """Complete a site visit: add feedback, photos, follow-up date."""
    doc = await db.site_visits.find_one({"id": visit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Site visit not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.site_visits.update_one({"id": visit_id}, {"$set": updates})

    # Update lead status if visit completed
    if "actual_at" in updates or "feedback" in updates:
        await db.leads.update_one(
            {"id": doc["lead_id"]},
            {"$set": {"status": "SITE_VISIT_DONE", "updated_at": _now()}},
        )
        await _log_activity(
            doc["lead_id"], "MEETING",
            f"Site visit completed. Feedback: {updates.get('feedback', 'N/A')}", user,
        )

    updated = await db.site_visits.find_one({"id": visit_id}, {"_id": 0})
    return SiteVisit(**updated)


# ──────────────────────────────────────────────────────────────────────
#  QUOTATIONS
# ──────────────────────────────────────────────────────────────────────

def _generate_quotation_pdf(quote_id: str, lead: dict, plots: list, total: float, valid_until: str, generated_by: str) -> str:
    """Generate a branded PDF quotation and return the file path."""
    import io
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    pdf_dir = Path(__file__).parent.parent / "generated_pdfs"
    pdf_dir.mkdir(exist_ok=True)
    filepath = pdf_dir / f"quotation_{quote_id}.pdf"

    doc = SimpleDocTemplate(str(filepath), pagesize=A4, topMargin=25 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()

    brand_style = ParagraphStyle("Brand", parent=styles["Heading1"], fontSize=22, textColor=rl_colors.HexColor("#1a365d"), alignment=TA_CENTER, spaceAfter=4)
    project_style = ParagraphStyle("Project", parent=styles["Heading2"], fontSize=14, textColor=rl_colors.HexColor("#2d3748"), alignment=TA_CENTER, spaceAfter=12)
    section_style = ParagraphStyle("Section", parent=styles["Heading3"], fontSize=12, textColor=rl_colors.HexColor("#1a365d"), spaceAfter=6)
    normal = styles["Normal"]
    right_style = ParagraphStyle("Right", parent=normal, alignment=TA_RIGHT, fontSize=9, textColor=rl_colors.grey)

    elements = []

    # Header
    elements.append(Paragraph("STERLITEE DEVELOPERS LLP", brand_style))
    elements.append(Paragraph("Regal Park Villas", project_style))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"Quotation Ref: RPV-Q-{quote_id[:8].upper()}", right_style))
    elements.append(Paragraph(f"Date: {_now()[:10]}", right_style))
    elements.append(Spacer(1, 6 * mm))

    # Lead info
    elements.append(Paragraph("Prepared For", section_style))
    elements.append(Paragraph(f"<b>{lead.get('full_name', 'N/A')}</b>", normal))
    elements.append(Paragraph(f"Phone: {lead.get('phone', 'N/A')} &nbsp; | &nbsp; Email: {lead.get('email', 'N/A')}", normal))
    elements.append(Spacer(1, 6 * mm))

    # Plot details table
    elements.append(Paragraph("Price Breakdown", section_style))
    table_data = [["Plot No", "Elevation", "Base Price (₹)", "Premium %", "Quoted Price (₹)"]]
    for p in plots:
        table_data.append([
            str(p["plot_no"]),
            p["elevation"],
            f"₹{p['base_price_inr']:,.0f}",
            f"{p['premium_pct']}%",
            f"₹{p['quoted_price_inr']:,.0f}",
        ])
    table_data.append(["", "", "", "TOTAL", f"₹{total:,.0f}"])

    tbl = Table(table_data, colWidths=[60, 80, 100, 70, 110])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#1a365d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, rl_colors.HexColor("#cbd5e0")),
        ("BACKGROUND", (0, -1), (-1, -1), rl_colors.HexColor("#edf2f7")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [rl_colors.white, rl_colors.HexColor("#f7fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 8 * mm))

    # Validity
    elements.append(Paragraph(f"<b>Validity:</b> This quotation is valid until <b>{valid_until}</b>.", normal))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal))
    elements.append(Spacer(1, 10 * mm))

    # Disclaimer
    disc_style = ParagraphStyle("Disc", parent=normal, fontSize=8, textColor=rl_colors.grey, spaceAfter=2)
    elements.append(Paragraph("<b>Disclaimer:</b> This quotation is subject to management approval and plot availability. "
                              "Prices may change without prior notice. This document does not constitute a booking or a legally binding agreement. "
                              "Final pricing will be confirmed upon booking and execution of the sale agreement.", disc_style))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph("© Sterlitee Developers LLP — Regal Park Villas", disc_style))

    doc.build(elements)
    return str(filepath)


@router.post("/quotations", response_model=Quotation)
async def create_quotation(body: QuotationCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Generate a quotation for selected plots with branded PDF."""
    lead = await db.leads.find_one({"id": body.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    # Validate all plots exist and are available
    for qp in body.plots:
        plot = await db.plots.find_one({"plot_no": qp.plot_no}, {"_id": 0})
        if not plot:
            raise HTTPException(404, f"Plot {qp.plot_no} not found")
        current_sales = plot.get("sales_status", plot.get("status", "AVAILABLE"))
        if current_sales in ("SOLD", "BOOKED"):
            raise HTTPException(
                409, f"Plot {qp.plot_no} is not available (status: {current_sales})",
            )

    total = sum(p.quoted_price_inr for p in body.plots)
    now = _now()
    quote_id = str(uuid.uuid4())

    # Generate PDF
    pdf_path = _generate_quotation_pdf(
        quote_id, lead,
        [p.model_dump() for p in body.plots],
        total, body.valid_until, user.full_name,
    )
    pdf_url = f"/api/crm/quotations/{quote_id}/pdf"

    doc = {
        "id": quote_id,
        "lead_id": body.lead_id,
        "plots": [p.model_dump() for p in body.plots],
        "total_value_inr": total,
        "valid_until": body.valid_until,
        "generated_by": user.full_name,
        "pdf_url": pdf_url,
        "created_at": now,
    }
    await db.quotations.insert_one({**doc, "_id": doc["id"]})

    await _log_activity(
        body.lead_id, "NOTE",
        f"Quotation generated for {len(body.plots)} plot(s), total ₹{total:,.0f}", user,
    )
    return Quotation(**doc)


@router.get("/quotations", response_model=List[Quotation])
async def list_quotations(
    lead_id: Optional[str] = None,
    user: User = Depends(require_roles(CRM_READ_ROLES)),
):
    filt: dict = {}
    if lead_id:
        filt["lead_id"] = lead_id
    rows = await db.quotations.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Quotation(**r) for r in rows]


@router.get("/quotations/{quote_id}/pdf")
async def download_quotation_pdf(quote_id: str, user: User = Depends(get_user_flexible)):
    """Download the branded PDF for a quotation."""
    from starlette.responses import FileResponse

    doc = await db.quotations.find_one({"id": quote_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quotation not found")

    pdf_dir = Path(__file__).parent.parent / "generated_pdfs"
    filepath = pdf_dir / f"quotation_{quote_id}.pdf"

    if not filepath.exists():
        # Regenerate if missing
        lead = await db.leads.find_one({"id": doc["lead_id"]}, {"_id": 0}) or {}
        _generate_quotation_pdf(
            quote_id, lead, doc["plots"],
            doc["total_value_inr"], doc["valid_until"], doc["generated_by"],
        )

    return FileResponse(
        str(filepath),
        media_type="application/pdf",
        filename=f"Regal_Park_Quotation_{quote_id[:8].upper()}.pdf",
    )


# ──────────────────────────────────────────────────────────────────────
#  BOOKINGS
# ──────────────────────────────────────────────────────────────────────

@router.post("/bookings", response_model=Booking)
async def create_booking(body: BookingCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Create a provisional booking for a plot.

    CRIT-4: Atomic booking creation with optimistic locking.
    - Plot status is atomically changed AVAILABLE/RESERVED → BOOKED
    - Unique partial index prevents duplicate active bookings per plot
    """
    from pymongo.errors import DuplicateKeyError

    # Validate lead exists
    lead = await db.leads.find_one({"id": body.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    # Validate plot exists
    plot = await db.plots.find_one({"plot_no": body.plot_no}, {"_id": 0})
    if not plot:
        raise HTTPException(404, f"Plot {body.plot_no} not found")

    now = _now()
    booking_id = str(uuid.uuid4())
    doc = {
        "id": booking_id,
        **body.model_dump(),
        "booking_date": now[:10],
        "agreement_date": None,
        "agreement_doc_url": None,
        "discount_approved_by": user.full_name if body.discount_pct > 0 else None,
        "status": "PROVISIONAL",
        "cancelled_reason": None,
        "created_by": user.full_name,
        "created_at": now,
    }

    # ── ATOMIC STEP 1: Claim the plot using optimistic locking ──
    # Only succeeds if plot is currently AVAILABLE or RESERVED
    claim_result = await db.plots.update_one(
        {"plot_no": body.plot_no, "sales_status": {"$in": ["AVAILABLE", "RESERVED"]}},
        {"$set": {"sales_status": "BOOKED", "sale_value_inr": body.sale_value_inr, "sold_date": now[:10]}},
    )
    if claim_result.modified_count == 0:
        # Another booking already claimed this plot
        current_sales = plot.get("sales_status", plot.get("status", "AVAILABLE"))
        raise HTTPException(
            409,
            f"Plot {body.plot_no} is no longer available (current status: {current_sales}). "
            f"Another booking may have claimed it.",
        )

    # ── ATOMIC STEP 2: Insert booking (unique index prevents duplicates) ──
    try:
        await db.bookings.insert_one({**doc, "_id": doc["id"]})
    except DuplicateKeyError:
        # Rollback: release the plot since we couldn't insert the booking
        await db.plots.update_one(
            {"plot_no": body.plot_no, "sales_status": "BOOKED"},
            {"$set": {"sales_status": "AVAILABLE"}},
        )
        raise HTTPException(
            409,
            f"Plot {body.plot_no} already has an active booking (duplicate detected at database level).",
        )

    # ── Non-critical follow-ups (safe to proceed) ──
    await db.leads.update_one(
        {"id": body.lead_id},
        {"$set": {"status": "BOOKING", "updated_at": now}},
    )

    await _log_activity(
        body.lead_id, "NOTE",
        f"Booking created for Plot #{body.plot_no}, ₹{body.sale_value_inr:,.0f} ({body.discount_pct}% discount)", user,
    )

    # Auto-create approval chain
    await _create_booking_approval(doc, lead)

    # Auto-create discount request if discount > 0
    if body.discount_pct > 0:
        await _create_discount_request(doc, user)

    return Booking(**doc)


@router.get("/bookings", response_model=List[Booking])
async def list_bookings(
    status: Optional[str] = None,
    user: User = Depends(require_roles(CRM_READ_ROLES)),
):
    filt: dict = {}
    if status:
        filt["status"] = status
    rows = await db.bookings.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Booking(**r) for r in rows]


@router.get("/bookings/{booking_id}", response_model=Booking)
async def get_booking(booking_id: str, user: User = Depends(require_roles(CRM_READ_ROLES))):
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Booking not found")
    return Booking(**doc)


@router.patch("/bookings/{booking_id}", response_model=Booking)
async def update_booking(
    booking_id: str,
    body: BookingUpdate,
    user: User = Depends(require_roles(SALES_MGMT_ROLES)),
):
    """Confirm or cancel a booking. Only SALES_MANAGER/ADMIN/PD."""
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Booking not found")

    if doc["status"] in ("CONFIRMED", "CANCELLED"):
        raise HTTPException(409, f"Booking is already {doc['status']}")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates:
        if updates["status"] not in BOOKING_STATUSES:
            raise HTTPException(422, f"Invalid status. Must be one of: {BOOKING_STATUSES}")
        if updates["status"] == "CANCELLED":
            if not updates.get("cancelled_reason"):
                raise HTTPException(422, "cancelled_reason is required when cancelling")
            # Release the plot
            await db.plots.update_one(
                {"plot_no": doc["plot_no"]},
                {"$set": {"sales_status": "AVAILABLE"}, "$unset": {"sale_value_inr": "", "sold_date": ""}},
            )
            # Update lead status
            await db.leads.update_one(
                {"id": doc["lead_id"]},
                {"$set": {"status": "LOST", "updated_at": _now()}},
            )

    await db.bookings.update_one({"id": booking_id}, {"$set": updates})

    if "status" in updates:
        await _log_activity(
            doc["lead_id"], "NOTE",
            f"Booking {updates['status']} by {user.full_name}", user,
        )

    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return Booking(**updated)


# ──────────────────────────────────────────────────────────────────────
#  BOOKING → PROJECT CONVERSION
# ──────────────────────────────────────────────────────────────────────

@router.post("/bookings/{booking_id}/convert")
async def convert_booking_to_project(
    booking_id: str,
    user: User = Depends(require_roles({"ADMIN"})),
):
    """Convert an APPROVED booking into a construction project.

    CRIT-4: Atomic conversion with optimistic locking.
    - Booking status APPROVED→CONFIRMED is atomic (update_one with condition)
    - Client + project creation is idempotent (find-or-create)
    - Duplicate clicks are harmless
    """
    from pymongo.errors import DuplicateKeyError

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Idempotency: already converted
    if booking["status"] == "CONFIRMED":
        project = await db.projects.find_one({"plot_number": f"Plot {booking['plot_no']}, Regal Park"}, {"_id": 0})
        milestones = await db.payment_milestones.find({"booking_id": booking_id}, {"_id": 0}).to_list(20)
        return {
            "message": "Already converted",
            "booking": Booking(**booking).model_dump(),
            "project_id": project["id"] if project else None,
            "milestones_count": len(milestones),
        }

    if booking["status"] != "APPROVED":
        raise HTTPException(
            409,
            f"Booking must be APPROVED to convert (current: {booking['status']}). "
            f"Complete the booking approval workflow first.",
        )

    # Verify discount approval if discount > 0
    if booking.get("discount_pct", 0) > 0:
        disc = await db.discount_requests.find_one(
            {"booking_id": booking_id, "status": {"$in": ["APPROVED", "COUNTER_OFFERED"]}},
        )
        if not disc:
            raise HTTPException(
                409,
                "Discount approval is pending. Complete discount approval before converting.",
            )

    # ── ATOMIC STEP 1: Lock booking status APPROVED → CONFIRMED ──
    # Only one request can transition from APPROVED — prevents duplicate conversions
    lock_result = await db.bookings.update_one(
        {"id": booking_id, "status": "APPROVED"},
        {"$set": {"status": "CONFIRMED", "agreement_date": _now()[:10]}},
    )
    if lock_result.modified_count == 0:
        # Re-check current status for better error message
        current = await db.bookings.find_one({"id": booking_id}, {"status": 1, "_id": 0})
        if current and current.get("status") == "CONFIRMED":
            return {"message": "Already converted (concurrent request)"}
        raise HTTPException(409, "Booking is no longer APPROVED — conversion failed.")

    now = _now()
    lead = await db.leads.find_one({"id": booking["lead_id"]}, {"_id": 0}) or {}
    plot = await db.plots.find_one({"plot_no": booking["plot_no"]}, {"_id": 0}) or {}

    # ── STEP 2: Create CLIENT user (idempotent — find or create) ──
    client_email = (lead.get("email") or f"client.plot{booking['plot_no']}@regalpark.com").lower()
    existing_client = await db.users.find_one({"email": client_email}, {"_id": 0})
    if existing_client:
        client_id = existing_client["id"]
    else:
        client_id = str(uuid.uuid4())
        client_doc = {
            "id": client_id,
            "email": client_email,
            "full_name": booking["client_name"],
            "role": "CLIENT",
            "phone": lead.get("phone"),
            "company": None,
            "is_active": True,
            "hashed_password": hash_pw("RegalPark@2026"),
        }
        try:
            await db.users.insert_one({**client_doc, "_id": client_id})
        except DuplicateKeyError:
            # Concurrent insert — fetch the existing one
            existing_client = await db.users.find_one({"email": client_email}, {"_id": 0})
            client_id = existing_client["id"] if existing_client else client_id

    # ── STEP 3: Create project (idempotent — find or create) ──
    plot_label = f"Plot {booking['plot_no']}, Regal Park"
    existing_project = await db.projects.find_one({"plot_number": plot_label}, {"_id": 0})
    if existing_project:
        project_id = existing_project["id"]
    else:
        project_id = str(uuid.uuid4())
        dim = plot.get("dimension_ft", "40 x 50")
        parts = dim.split("x")
        sqft = int(float(parts[0].strip()) * float(parts[1].strip())) if len(parts) == 2 else 2000

        project_doc = {
            "id": project_id,
            "name": f"{booking['elevation_type']} Villa — Plot #{booking['plot_no']}",
            "plot_number": plot_label,
            "client_name": booking["client_name"],
            "client_id": client_id,
            "villa_type": booking["elevation_type"],
            "built_up_area_sqft": sqft,
            "start_date": now[:10],
            "target_handover_date": "",  # to be set by PM
            "budget_inr": booking["sale_value_inr"],
            "actual_spent_inr": 0.0,
            "progress_pct": 0.0,
            "project_manager": "",
            "site_engineer": "",
            "consultants": [],
            "contractors": [],
            "hero_image_url": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "IN_PROGRESS",
        }
        try:
            await db.projects.insert_one({**project_doc, "_id": project_id})
        except DuplicateKeyError:
            existing_project = await db.projects.find_one({"plot_number": plot_label}, {"_id": 0})
            project_id = existing_project["id"] if existing_project else project_id

    # ── STEP 4: Create payment milestones (idempotent) ──
    existing_milestones = await db.payment_milestones.count_documents({"booking_id": booking_id})
    if existing_milestones == 0:
        sale = booking["sale_value_inr"]
        # Split: Booking(10%), Agreement(15%), Foundation(20%), Structure(25%), Finishing(20%), Handover(10%)
        pct_splits = [10, 15, 20, 25, 20, 10]
        milestone_docs = []
        for i, (name, pct) in enumerate(zip(MILESTONE_NAMES, pct_splits)):
            amt = round(sale * pct / 100, 2)
            m = {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "project_id": project_id,
                "plot_no": booking["plot_no"],
                "client_name": booking["client_name"],
                "milestone_name": name,
                "order": i + 1,
                "amount_inr": amt,
                "due_date": None,
                "paid_date": now[:10] if name == "Booking Amount" else None,
                "status": "PAID" if name == "Booking Amount" else "PENDING",
                "created_at": now,
            }
            milestone_docs.append(m)
        await db.payment_milestones.insert_many([{**m, "_id": m["id"]} for m in milestone_docs])

    # ── STEP 5: Update plot → UNDER_CONSTRUCTION ──
    await db.plots.update_one(
        {"plot_no": booking["plot_no"]},
        {"$set": {"sales_status": "UNDER_CONSTRUCTION"}},
    )

    await _log_activity(
        booking["lead_id"], "NOTE",
        f"Booking converted to project by {user.full_name}. Project ID: {project_id[:8]}", user,
    )

    return {
        "message": "Booking converted to project successfully",
        "project_id": project_id,
        "client_id": client_id,
        "milestones_count": len(MILESTONE_NAMES),
        "booking_status": "CONFIRMED",
        "plot_sales_status": "UNDER_CONSTRUCTION",
    }


# ──────────────────────────────────────────────────────────────────────
#  CRM DASHBOARD (aggregation)
# ──────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def crm_dashboard(user: User = Depends(require_roles(CRM_READ_ROLES))):
    """Sales dashboard: pipeline funnel, booking stats."""
    # Lead funnel
    pipeline = []
    for s in LEAD_STATUSES:
        count = await db.leads.count_documents({"status": s})
        pipeline.append({"status": s, "count": count})

    # Booking summary
    total_bookings = await db.bookings.count_documents({})
    provisional = await db.bookings.count_documents({"status": "PROVISIONAL"})
    confirmed = await db.bookings.count_documents({"status": "CONFIRMED"})
    cancelled = await db.bookings.count_documents({"status": "CANCELLED"})

    # Pipeline value
    booking_docs = await db.bookings.find(
        {"status": {"$in": ["PROVISIONAL", "CONFIRMED"]}},
        {"_id": 0, "sale_value_inr": 1},
    ).to_list(500)
    pipeline_value = sum(b.get("sale_value_inr", 0) for b in booking_docs)

    # Total leads
    total_leads = await db.leads.count_documents({})

    return {
        "total_leads": total_leads,
        "lead_funnel": pipeline,
        "total_bookings": total_bookings,
        "provisional_bookings": provisional,
        "confirmed_bookings": confirmed,
        "cancelled_bookings": cancelled,
        "pipeline_value_inr": pipeline_value,
    }


# ──────────────────────────────────────────────────────────────────────
#  INTERNAL HELPERS
# ──────────────────────────────────────────────────────────────────────

async def _log_activity(lead_id: str, activity_type: str, description: str, user: User):
    """Create a CRM activity log entry."""
    doc = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "type": activity_type,
        "description": description,
        "created_by": user.full_name,
        "created_at": _now(),
    }
    await db.crm_activities.insert_one({**doc, "_id": doc["id"]})


# ──────────────────────────────────────────────────────────────────────
#  SALES INVENTORY
# ──────────────────────────────────────────────────────────────────────

@router.get("/inventory", response_model=List[Plot])
async def list_inventory(
    sales_status: Optional[str] = Query(None),
    elevation_type: Optional[str] = Query(None),
    facing: Optional[str] = Query(None),
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    user: User = Depends(require_roles(CRM_READ_ROLES)),
):
    """Sales inventory board — all plots with optional filters."""
    filt: dict = {}
    if sales_status:
        filt["sales_status"] = sales_status
    if elevation_type:
        filt["$or"] = [
            {"elevation_type": elevation_type},
            {"villa_type": elevation_type},
        ]
    if facing:
        filt["facing"] = facing
    if price_min is not None:
        filt.setdefault("asking_price_inr", {})["$gte"] = price_min
    if price_max is not None:
        filt.setdefault("asking_price_inr", {})["$lte"] = price_max

    rows = await db.plots.find(filt, {"_id": 0}).sort("plot_no", 1).to_list(300)
    return [Plot(**r) for r in rows]


@router.patch("/inventory/{plot_no}/reserve")
async def reserve_plot(plot_no: int, user: User = Depends(require_roles(CRM_ROLES))):
    """Reserve a plot for a prospective buyer.

    Prevents reserving plots that are already SOLD or BOOKED.
    """
    doc = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Plot not found")

    current_status = doc.get("sales_status", doc.get("status", "AVAILABLE"))
    if current_status in ("SOLD", "BOOKED"):
        raise HTTPException(
            409,
            f"Plot {plot_no} is already {current_status} and cannot be reserved.",
        )

    await db.plots.update_one(
        {"plot_no": plot_no},
        {"$set": {"sales_status": "RESERVED", "reserved_by": user.full_name, "reserved_at": _now()}},
    )
    updated = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    return Plot(**updated)


@router.patch("/inventory/{plot_no}/release")
async def release_plot(plot_no: int, user: User = Depends(require_roles(CRM_ROLES))):
    """Release a reserved plot back to AVAILABLE.

    Only RESERVED plots can be released. SOLD/BOOKED plots require management action.
    """
    doc = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Plot not found")

    current_status = doc.get("sales_status", doc.get("status", "AVAILABLE"))
    if current_status != "RESERVED":
        raise HTTPException(
            409,
            f"Plot {plot_no} is {current_status}, only RESERVED plots can be released.",
        )

    await db.plots.update_one(
        {"plot_no": plot_no},
        {"$set": {"sales_status": "AVAILABLE"}, "$unset": {"reserved_by": "", "reserved_at": ""}},
    )
    updated = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    return Plot(**updated)


# ──────────────────────────────────────────────────────────────────────
#  BOOKING APPROVALS
# ──────────────────────────────────────────────────────────────────────

async def _create_booking_approval(booking: dict, lead: dict):
    """Build approval chain based on sale_value_inr and persist."""
    value = booking["sale_value_inr"]
    levels = [
        ApprovalLevel(level=1, required_role="SALES_MANAGER").model_dump(),
    ]
    if value > 30_000_000:
        levels.append(ApprovalLevel(level=2, required_role="PROJECT_DIRECTOR").model_dump())
    if value > 50_000_000:
        levels.append(ApprovalLevel(level=3, required_role="COO").model_dump())

    doc = {
        "id": str(uuid.uuid4()),
        "booking_id": booking["id"],
        "lead_id": booking["lead_id"],
        "plot_no": booking["plot_no"],
        "client_name": booking["client_name"],
        "sale_value_inr": value,
        "elevation_type": booking["elevation_type"],
        "levels": levels,
        "current_level": 1,
        "overall_status": "PENDING",
        "created_at": _now(),
    }
    await db.booking_approvals.insert_one({**doc, "_id": doc["id"]})
    return doc


# Roles allowed to view approvals
APPROVAL_VIEW_ROLES = {"ADMIN", "COO", "PROJECT_DIRECTOR", "SALES_MANAGER"}


@router.get("/booking-approvals", response_model=List[BookingApproval])
async def list_booking_approvals(
    status: Optional[str] = Query(None),
    user: User = Depends(require_roles(APPROVAL_VIEW_ROLES)),
):
    """List booking approvals — filterable by status. Each user sees only
    approvals where their role is the required_role for the current level,
    or all if ADMIN."""
    filt: dict = {}
    if status:
        filt["overall_status"] = status

    rows = await db.booking_approvals.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Filter to show only approvals actionable by this user's role
    if user.role != "ADMIN":
        rows = [
            r for r in rows
            if r["overall_status"] == "PENDING"
            and any(
                lvl["level"] == r["current_level"] and lvl["required_role"] == user.role
                for lvl in r["levels"]
            )
            or r["overall_status"] != "PENDING"  # show completed ones to all viewers
        ]

    return [BookingApproval(**r) for r in rows]


@router.get("/booking-approvals/{approval_id}", response_model=BookingApproval)
async def get_booking_approval(
    approval_id: str,
    user: User = Depends(require_roles(APPROVAL_VIEW_ROLES)),
):
    doc = await db.booking_approvals.find_one({"id": approval_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Approval not found")
    return BookingApproval(**doc)


@router.post("/booking-approvals/{approval_id}/decide", response_model=BookingApproval)
async def decide_booking_approval(
    approval_id: str,
    body: BookingApprovalDecision,
    user: User = Depends(require_roles(APPROVAL_VIEW_ROLES)),
):
    """Approve or reject a booking at the current level."""
    if body.decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(422, "Decision must be APPROVED or REJECTED")

    doc = await db.booking_approvals.find_one({"id": approval_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Approval not found")
    if doc["overall_status"] != "PENDING":
        raise HTTPException(409, f"Approval is already {doc['overall_status']}")

    # Verify user has permission for current level
    current = doc["current_level"]
    current_level_data = None
    for lvl in doc["levels"]:
        if lvl["level"] == current:
            current_level_data = lvl
            break

    if not current_level_data:
        raise HTTPException(500, "Approval chain is corrupted")

    # ADMIN can approve at any level; otherwise must match required_role
    if user.role != "ADMIN" and user.role != current_level_data["required_role"]:
        raise HTTPException(
            403,
            f"Level {current} requires {current_level_data['required_role']}, you are {user.role}",
        )

    now = _now()

    if body.decision == "REJECTED":
        # Reject: mark level, set overall to REJECTED
        for lvl in doc["levels"]:
            if lvl["level"] == current:
                lvl["status"] = "REJECTED"
                lvl["decided_by"] = user.full_name
                lvl["decided_at"] = now
                lvl["note"] = body.note

        await db.booking_approvals.update_one(
            {"id": approval_id},
            {"$set": {"levels": doc["levels"], "overall_status": "REJECTED"}},
        )

        # Cancel booking and release plot
        await db.bookings.update_one(
            {"id": doc["booking_id"]},
            {"$set": {"status": "CANCELLED", "cancelled_reason": f"Rejected by {user.full_name}: {body.note or 'No reason'}"}},
        )
        await db.plots.update_one(
            {"plot_no": doc["plot_no"]},
            {"$set": {"sales_status": "AVAILABLE"}, "$unset": {"sale_value_inr": "", "sold_date": ""}},
        )
        await db.leads.update_one(
            {"id": doc["lead_id"]},
            {"$set": {"status": "LOST", "updated_at": now}},
        )
        await _log_activity(
            doc["lead_id"], "NOTE",
            f"Booking rejected by {user.full_name} at Level {current}: {body.note or 'N/A'}", user,
        )

    else:
        # Approve current level
        for lvl in doc["levels"]:
            if lvl["level"] == current:
                lvl["status"] = "APPROVED"
                lvl["decided_by"] = user.full_name
                lvl["decided_at"] = now
                lvl["note"] = body.note

        # Check if there's a next level
        max_level = max(lvl["level"] for lvl in doc["levels"])
        if current < max_level:
            # Advance to next level
            await db.booking_approvals.update_one(
                {"id": approval_id},
                {"$set": {"levels": doc["levels"], "current_level": current + 1}},
            )
            await _log_activity(
                doc["lead_id"], "NOTE",
                f"Booking approved at Level {current} by {user.full_name}, advancing to Level {current + 1}", user,
            )
        else:
            # Final approval
            await db.booking_approvals.update_one(
                {"id": approval_id},
                {"$set": {"levels": doc["levels"], "overall_status": "APPROVED"}},
            )
            # Confirm booking
            await db.bookings.update_one(
                {"id": doc["booking_id"]},
                {"$set": {"status": "APPROVED"}},
            )
            await _log_activity(
                doc["lead_id"], "NOTE",
                f"Booking fully approved by {user.full_name}. Plot #{doc['plot_no']} sale confirmed.", user,
            )

    updated = await db.booking_approvals.find_one({"id": approval_id}, {"_id": 0})
    return BookingApproval(**updated)


# ──────────────────────────────────────────────────────────────────────
#  DISCOUNT REQUESTS
# ──────────────────────────────────────────────────────────────────────

def _discount_tier_role(pct: float) -> str:
    """Return the required approver role based on discount percentage tier."""
    if pct <= 3.0:
        return "SALES_MANAGER"
    elif pct <= 5.0:
        return "PROJECT_DIRECTOR"
    elif pct <= 8.0:
        return "COO"
    else:
        return "ADMIN"  # >8% needs ADMIN


async def _create_discount_request(booking: dict, user) -> dict:
    """Create a discount request tied to a booking."""
    pct = booking["discount_pct"]
    sale = booking["sale_value_inr"]
    discount_amt = round(sale * pct / 100, 2)
    net = round(sale - discount_amt, 2)

    doc = {
        "id": str(uuid.uuid4()),
        "booking_id": booking["id"],
        "lead_id": booking["lead_id"],
        "plot_no": booking["plot_no"],
        "client_name": booking["client_name"],
        "elevation_type": booking["elevation_type"],
        "sale_value_inr": sale,
        "discount_pct": pct,
        "discount_amount_inr": discount_amt,
        "net_value_inr": net,
        "margin_impact_inr": discount_amt,
        "required_approver_role": _discount_tier_role(pct),
        "status": "PENDING",
        "decided_by": None,
        "decided_at": None,
        "decision_note": None,
        "counter_pct": None,
        "counter_amount_inr": None,
        "requested_by": user.full_name,
        "created_at": _now(),
    }
    await db.discount_requests.insert_one({**doc, "_id": doc["id"]})

    await _log_activity(
        booking["lead_id"], "NOTE",
        f"Discount request created: {pct}% (₹{discount_amt:,.0f}) on ₹{sale:,.0f}, requires {doc['required_approver_role']}",
        user,
    )
    return doc


# Roles that can view/decide discount requests
DISCOUNT_VIEW_ROLES = {"ADMIN", "COO", "PROJECT_DIRECTOR", "SALES_MANAGER"}


@router.get("/discount-requests", response_model=List[DiscountRequest])
async def list_discount_requests(
    status: Optional[str] = Query(None),
    user: User = Depends(require_roles(DISCOUNT_VIEW_ROLES)),
):
    """List discount requests. Non-ADMIN users see only requests they can act on plus completed ones."""
    filt: dict = {}
    if status:
        filt["status"] = status

    rows = await db.discount_requests.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)

    if user.role != "ADMIN":
        # Show actionable (matching role) + completed
        rows = [
            r for r in rows
            if (r["status"] == "PENDING" and r["required_approver_role"] == user.role)
            or r["status"] != "PENDING"
        ]

    return [DiscountRequest(**r) for r in rows]


@router.get("/discount-requests/{req_id}", response_model=DiscountRequest)
async def get_discount_request(
    req_id: str,
    user: User = Depends(require_roles(DISCOUNT_VIEW_ROLES)),
):
    doc = await db.discount_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Discount request not found")
    return DiscountRequest(**doc)


@router.post("/discount-requests/{req_id}/decide", response_model=DiscountRequest)
async def decide_discount_request(
    req_id: str,
    body: DiscountDecision,
    user: User = Depends(require_roles(DISCOUNT_VIEW_ROLES)),
):
    """Approve, reject, or counter-offer a discount request."""
    if body.decision not in ("APPROVED", "REJECTED", "COUNTER_OFFER"):
        raise HTTPException(422, "Decision must be APPROVED, REJECTED, or COUNTER_OFFER")

    doc = await db.discount_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Discount request not found")
    if doc["status"] != "PENDING":
        raise HTTPException(409, f"Request is already {doc['status']}")

    # Permission check: ADMIN can decide anything, otherwise must match tier
    if user.role != "ADMIN" and user.role != doc["required_approver_role"]:
        raise HTTPException(
            403,
            f"This discount requires {doc['required_approver_role']} approval, you are {user.role}",
        )

    now = _now()
    updates: dict = {
        "decided_by": user.full_name,
        "decided_at": now,
        "decision_note": body.note,
    }

    if body.decision == "APPROVED":
        updates["status"] = "APPROVED"
        # Update booking discount_approved_by
        await db.bookings.update_one(
            {"id": doc["booking_id"]},
            {"$set": {"discount_approved_by": user.full_name}},
        )
        await _log_activity(
            doc["lead_id"], "NOTE",
            f"Discount {doc['discount_pct']}% APPROVED by {user.full_name} (₹{doc['discount_amount_inr']:,.0f} margin impact)",
            user,
        )

    elif body.decision == "REJECTED":
        updates["status"] = "REJECTED"
        # Reset discount on booking to 0
        sale = doc["sale_value_inr"]
        await db.bookings.update_one(
            {"id": doc["booking_id"]},
            {"$set": {"discount_pct": 0, "sale_value_inr": sale, "discount_approved_by": None}},
        )
        await _log_activity(
            doc["lead_id"], "NOTE",
            f"Discount {doc['discount_pct']}% REJECTED by {user.full_name}: {body.note or 'N/A'}",
            user,
        )

    elif body.decision == "COUNTER_OFFER":
        if body.counter_pct is None or body.counter_pct <= 0:
            raise HTTPException(422, "counter_pct is required for COUNTER_OFFER")
        if body.counter_pct >= doc["discount_pct"]:
            raise HTTPException(422, "Counter must be less than original discount")

        counter_amt = round(doc["sale_value_inr"] * body.counter_pct / 100, 2)
        counter_net = round(doc["sale_value_inr"] - counter_amt, 2)

        updates["status"] = "COUNTER_OFFERED"
        updates["counter_pct"] = body.counter_pct
        updates["counter_amount_inr"] = counter_amt

        # Update booking with counter-offered discount
        await db.bookings.update_one(
            {"id": doc["booking_id"]},
            {"$set": {
                "discount_pct": body.counter_pct,
                "discount_approved_by": user.full_name,
            }},
        )
        await _log_activity(
            doc["lead_id"], "NOTE",
            f"Discount counter-offered by {user.full_name}: {doc['discount_pct']}% → {body.counter_pct}% (₹{counter_amt:,.0f})",
            user,
        )

    await db.discount_requests.update_one({"id": req_id}, {"$set": updates})
    updated = await db.discount_requests.find_one({"id": req_id}, {"_id": 0})
    return DiscountRequest(**updated)


