"""CRM Revenue Engine: Pricing, Leads, Site Visits, Quotations, Bookings.

All routes prefixed with /crm (mounted under /api by server.py).
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth_utils import (
    CRM_READ_ROLES,
    CRM_ROLES,
    SALES_MGMT_ROLES,
    get_current_user,
    require_roles,
)
from config import db
from models import (
    BOOKING_STATUSES,
    LEAD_SOURCES,
    LEAD_STATUSES,
    Booking,
    BookingCreate,
    BookingUpdate,
    CrmActivity,
    Lead,
    LeadCreate,
    LeadUpdate,
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

@router.post("/quotations", response_model=Quotation)
async def create_quotation(body: QuotationCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Generate a quotation for selected plots."""
    lead = await db.leads.find_one({"id": body.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    # Validate all plots exist and are available
    for qp in body.plots:
        plot = await db.plots.find_one({"plot_no": qp.plot_no}, {"_id": 0})
        if not plot:
            raise HTTPException(404, f"Plot {qp.plot_no} not found")
        if plot["status"] not in ("AVAILABLE",):
            raise HTTPException(
                409, f"Plot {qp.plot_no} is not available (status: {plot['status']})",
            )

    total = sum(p.quoted_price_inr for p in body.plots)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "lead_id": body.lead_id,
        "plots": [p.model_dump() for p in body.plots],
        "total_value_inr": total,
        "valid_until": body.valid_until,
        "generated_by": user.full_name,
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


# ──────────────────────────────────────────────────────────────────────
#  BOOKINGS
# ──────────────────────────────────────────────────────────────────────

@router.post("/bookings", response_model=Booking)
async def create_booking(body: BookingCreate, user: User = Depends(require_roles(CRM_ROLES))):
    """Create a provisional booking for a plot."""
    # Validate lead exists
    lead = await db.leads.find_one({"id": body.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    # Validate plot is available
    plot = await db.plots.find_one({"plot_no": body.plot_no}, {"_id": 0})
    if not plot:
        raise HTTPException(404, f"Plot {body.plot_no} not found")
    if plot["status"] not in ("AVAILABLE",):
        raise HTTPException(409, f"Plot {body.plot_no} is not available (status: {plot['status']})")

    # Validate discount authority
    if body.discount_pct > 0 and user.role == "CRM_SALES" and body.discount_pct > 3.0:
        raise HTTPException(
            403,
            f"CRM_SALES can request up to 3% discount. {body.discount_pct}% requires SALES_MANAGER approval.",
        )

    # Check no existing active booking for this plot
    existing = await db.bookings.find_one(
        {"plot_no": body.plot_no, "status": {"$in": ["PROVISIONAL", "CONFIRMED"]}},
    )
    if existing:
        raise HTTPException(409, f"Plot {body.plot_no} already has an active booking")

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
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
    await db.bookings.insert_one({**doc, "_id": doc["id"]})

    # Hold the plot
    await db.plots.update_one(
        {"plot_no": body.plot_no},
        {"$set": {"status": "SOLD", "sale_value_inr": body.sale_value_inr, "sold_date": now[:10]}},
    )

    # Update lead status
    await db.leads.update_one(
        {"id": body.lead_id},
        {"$set": {"status": "BOOKING", "updated_at": now}},
    )

    await _log_activity(
        body.lead_id, "NOTE",
        f"Booking created for Plot #{body.plot_no}, ₹{body.sale_value_inr:,.0f} ({body.discount_pct}% discount)", user,
    )
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
                {"$set": {"status": "AVAILABLE"}, "$unset": {"sale_value_inr": "", "sold_date": ""}},
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
