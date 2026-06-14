"""COO Dashboard — Executive portfolio overview.

Provides high-level KPIs, project health matrix, and risk register
for the Chief Operating Officer. Read-only, aggregation-heavy.
"""
from fastapi import APIRouter, Depends

from auth_utils import require_roles
from config import db
from models import User

router = APIRouter(prefix="/coo", tags=["COO Dashboard"])

COO_ROLES = {"COO", "ADMIN"}


@router.get("/portfolio")
async def coo_portfolio(user: User = Depends(require_roles(COO_ROLES))):
    """Portfolio KPIs — plots, sales value, open approvals, delayed stages, snags."""

    # ── Plot Status Summary ──
    plots = await db.plots.find(
        {}, {"_id": 0, "plot_no": 1, "sales_status": 1, "status": 1,
             "asking_price_inr": 1, "dimension_ft": 1}
    ).to_list(500)

    total_plots = len(plots)
    status_counts = {}
    for p in plots:
        ss = p.get("sales_status") or p.get("status", "AVAILABLE")
        status_counts[ss] = status_counts.get(ss, 0) + 1

    available = status_counts.get("AVAILABLE", 0)
    reserved = status_counts.get("RESERVED", 0)
    booked = status_counts.get("BOOKED", 0)
    sold = status_counts.get("SOLD", 0)
    under_construction = status_counts.get("UNDER_CONSTRUCTION", 0)

    # ── Sales Value ──
    bookings = await db.bookings.find(
        {"status": {"$in": ["PROVISIONAL", "APPROVED", "CONFIRMED"]}},
        {"_id": 0, "sale_value_inr": 1, "discount_pct": 1, "status": 1},
    ).to_list(500)

    total_sales_value = sum(b.get("sale_value_inr", 0) for b in bookings)
    confirmed_value = sum(
        b.get("sale_value_inr", 0) for b in bookings if b["status"] == "CONFIRMED"
    )
    pipeline_value = total_sales_value - confirmed_value
    avg_discount = (
        sum(b.get("discount_pct", 0) for b in bookings) / len(bookings)
        if bookings else 0
    )

    # ── Projects ──
    projects = await db.projects.find(
        {}, {"_id": 0, "id": 1, "name": 1, "progress_pct": 1, "status": 1,
             "budget_inr": 1, "actual_spent_inr": 1}
    ).to_list(100)
    total_projects = len(projects)
    in_progress = sum(1 for p in projects if p.get("status") == "IN_PROGRESS")
    avg_progress = (
        sum(p.get("progress_pct", 0) for p in projects) / len(projects)
        if projects else 0
    )

    # ── Delayed Stages ──
    delayed_stages = await db.stages.count_documents({"status": "DELAYED"})

    # ── Open Snags ──
    open_snags = await db.snags.count_documents({"status": {"$ne": "RESOLVED"}})

    # ── Open Approvals ──
    pending_booking_approvals = await db.booking_approvals.count_documents(
        {"status": "PENDING"}
    )
    pending_discount_requests = await db.discount_requests.count_documents(
        {"status": "PENDING"}
    )
    pending_po_approvals = await db.approvals.count_documents(
        {"status": {"$ne": "APPROVED"}}
    )
    total_open_approvals = (
        pending_booking_approvals + pending_discount_requests + pending_po_approvals
    )

    # ── Leads pipeline ──
    total_leads = await db.leads.count_documents({})
    active_leads = await db.leads.count_documents(
        {"status": {"$nin": ["BOOKING", "LOST"]}}
    )

    # ── Payment collection ──
    milestones = await db.payment_milestones.find(
        {}, {"_id": 0, "amount_inr": 1, "status": 1}
    ).to_list(1000)
    total_collectible = sum(m["amount_inr"] for m in milestones)
    collected = sum(m["amount_inr"] for m in milestones if m["status"] == "PAID")

    return {
        "plot_summary": {
            "total": total_plots,
            "available": available,
            "reserved": reserved,
            "booked": booked,
            "sold": sold,
            "under_construction": under_construction,
        },
        "sales": {
            "total_sales_value_inr": total_sales_value,
            "confirmed_value_inr": confirmed_value,
            "pipeline_value_inr": pipeline_value,
            "avg_discount_pct": round(avg_discount, 2),
            "total_bookings": len(bookings),
        },
        "projects": {
            "total": total_projects,
            "in_progress": in_progress,
            "avg_progress_pct": round(avg_progress, 1),
        },
        "operations": {
            "delayed_stages": delayed_stages,
            "open_snags": open_snags,
            "total_open_approvals": total_open_approvals,
            "pending_booking_approvals": pending_booking_approvals,
            "pending_discount_requests": pending_discount_requests,
            "pending_po_approvals": pending_po_approvals,
        },
        "leads": {
            "total": total_leads,
            "active": active_leads,
        },
        "collections": {
            "total_collectible_inr": total_collectible,
            "collected_inr": collected,
            "pending_inr": total_collectible - collected,
        },
    }


@router.get("/projects-health")
async def coo_projects_health(user: User = Depends(require_roles(COO_ROLES))):
    """Project health matrix — per-project status, budget, progress, risk signals."""
    projects = await db.projects.find({}, {"_id": 0}).to_list(100)

    results = []
    for p in projects:
        pid = p["id"]

        # Stages
        stages = await db.stages.find(
            {"project_id": pid},
            {"_id": 0, "name": 1, "status": 1, "progress_pct": 1},
        ).to_list(50)
        delayed = sum(1 for s in stages if s.get("status") == "DELAYED")
        completed = sum(1 for s in stages if s.get("status") == "COMPLETED")

        # Snags
        snag_count = await db.snags.count_documents(
            {"project_id": pid, "status": {"$ne": "RESOLVED"}}
        )

        # Budget health
        budget = p.get("budget_inr", 0)
        spent = p.get("actual_spent_inr", 0)
        budget_pct = round(spent / budget * 100, 1) if budget else 0

        # Health score (simple heuristic)
        health = "GREEN"
        if delayed > 2 or budget_pct > 90 or snag_count > 5:
            health = "RED"
        elif delayed > 0 or budget_pct > 75 or snag_count > 2:
            health = "AMBER"

        results.append({
            "id": pid,
            "name": p.get("name", ""),
            "plot_number": p.get("plot_number", ""),
            "client_name": p.get("client_name", ""),
            "villa_type": p.get("villa_type", ""),
            "progress_pct": p.get("progress_pct", 0),
            "status": p.get("status", ""),
            "budget_inr": budget,
            "spent_inr": spent,
            "budget_used_pct": budget_pct,
            "total_stages": len(stages),
            "completed_stages": completed,
            "delayed_stages": delayed,
            "open_snags": snag_count,
            "health": health,
        })

    results.sort(key=lambda x: {"RED": 0, "AMBER": 1, "GREEN": 2}.get(x["health"], 3))
    return results


@router.get("/risk-register")
async def coo_risk_register(user: User = Depends(require_roles(COO_ROLES))):
    """Risk register — delayed stages, overdue milestones, high-value pending approvals."""
    risks = []

    # 1. Delayed stages
    delayed = await db.stages.find(
        {"status": "DELAYED"},
        {"_id": 0, "project_id": 1, "name": 1, "planned_end": 1, "delay_reason": 1},
    ).to_list(50)
    for d in delayed:
        proj = await db.projects.find_one(
            {"id": d["project_id"]}, {"_id": 0, "name": 1}
        )
        risks.append({
            "type": "DELAYED_STAGE",
            "severity": "HIGH",
            "title": f"{d['name']} delayed",
            "detail": d.get("delay_reason") or "No reason recorded",
            "project": proj["name"] if proj else d["project_id"][:8],
            "due_date": d.get("planned_end"),
        })

    # 2. Overdue payment milestones
    overdue = await db.payment_milestones.find(
        {"status": "OVERDUE"},
        {"_id": 0, "milestone_name": 1, "client_name": 1, "amount_inr": 1,
         "due_date": 1, "plot_no": 1},
    ).to_list(50)
    for o in overdue:
        risks.append({
            "type": "OVERDUE_PAYMENT",
            "severity": "HIGH",
            "title": f"{o['milestone_name']} overdue — Plot #{o['plot_no']}",
            "detail": f"{o['client_name']} · ₹{o['amount_inr']:,.0f}",
            "project": f"Plot #{o['plot_no']}",
            "due_date": o.get("due_date"),
        })

    # 3. Open snags (critical)
    open_snags = await db.snags.find(
        {"status": {"$ne": "RESOLVED"}, "severity": "CRITICAL"},
        {"_id": 0, "project_id": 1, "title": 1, "location": 1, "severity": 1},
    ).to_list(50)
    for s in open_snags:
        proj = await db.projects.find_one(
            {"id": s.get("project_id")}, {"_id": 0, "name": 1}
        )
        risks.append({
            "type": "CRITICAL_SNAG",
            "severity": "CRITICAL",
            "title": s.get("title", "Unnamed snag"),
            "detail": s.get("location", ""),
            "project": proj["name"] if proj else "",
            "due_date": None,
        })

    # 4. Pending high-value booking approvals
    pending_approvals = await db.booking_approvals.find(
        {"status": "PENDING"},
        {"_id": 0, "booking_id": 1, "approval_chain": 1},
    ).to_list(20)
    for pa in pending_approvals:
        booking = await db.bookings.find_one(
            {"id": pa["booking_id"]},
            {"_id": 0, "client_name": 1, "sale_value_inr": 1, "plot_no": 1},
        )
        if booking and booking.get("sale_value_inr", 0) > 30_000_000:
            risks.append({
                "type": "PENDING_HIGH_VALUE_APPROVAL",
                "severity": "MEDIUM",
                "title": f"₹{booking['sale_value_inr']/1e7:.1f}Cr booking awaiting approval",
                "detail": f"{booking['client_name']} · Plot #{booking['plot_no']}",
                "project": f"Plot #{booking['plot_no']}",
                "due_date": None,
            })

    # Sort: CRITICAL > HIGH > MEDIUM
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    risks.sort(key=lambda r: severity_order.get(r["severity"], 9))

    return {
        "total_risks": len(risks),
        "critical": sum(1 for r in risks if r["severity"] == "CRITICAL"),
        "high": sum(1 for r in risks if r["severity"] == "HIGH"),
        "medium": sum(1 for r in risks if r["severity"] == "MEDIUM"),
        "risks": risks,
    }
