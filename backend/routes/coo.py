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


@router.get("/command-center")
async def coo_command_center(user: User = Depends(require_roles(COO_ROLES))):
    """Consolidated COO Command Center — all 10 panels in one response."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    # ── Parallel data fetch ──────────────────────────────────
    plots = await db.plots.find(
        {}, {"_id": 0, "plot_no": 1, "sales_status": 1, "asking_price_inr": 1,
             "elevation_type": 1}
    ).to_list(500)

    bookings = await db.bookings.find(
        {}, {"_id": 0, "id": 1, "sale_value_inr": 1, "discount_pct": 1,
             "status": 1, "client_name": 1, "plot_no": 1, "created_at": 1,
             "booking_amount_inr": 1, "elevation_type": 1}
    ).to_list(500)

    projects = await db.projects.find(
        {}, {"_id": 0, "id": 1, "name": 1, "progress_pct": 1, "status": 1,
             "budget_inr": 1, "actual_spent_inr": 1, "client_name": 1,
             "plot_number": 1, "villa_type": 1, "target_handover_date": 1}
    ).to_list(200)

    all_stages = await db.stages.find(
        {}, {"_id": 0, "project_id": 1, "name": 1, "status": 1,
             "progress_pct": 1, "planned_end": 1, "delay_reason": 1}
    ).to_list(5000)

    milestones = await db.payment_milestones.find(
        {}, {"_id": 0, "project_id": 1, "milestone_name": 1, "amount_inr": 1,
             "status": 1, "due_date": 1, "client_name": 1, "plot_no": 1}
    ).to_list(2000)

    snags = await db.snags.find(
        {"status": {"$ne": "RESOLVED"}},
        {"_id": 0, "project_id": 1, "title": 1, "severity": 1,
         "location": 1, "status": 1, "created_at": 1}
    ).to_list(200)

    booking_approvals = await db.booking_approvals.find(
        {"status": "PENDING"},
        {"_id": 0, "booking_id": 1, "current_level": 1, "created_at": 1}
    ).to_list(50)

    discount_requests = await db.discount_requests.find(
        {"status": "PENDING"},
        {"_id": 0, "booking_id": 1, "requested_discount_pct": 1}
    ).to_list(50)

    po_approvals = await db.approvals.find(
        {"status": {"$ne": "APPROVED"}},
        {"_id": 0, "type": 1, "amount": 1, "description": 1}
    ).to_list(50)

    leads = await db.leads.find(
        {}, {"_id": 0, "status": 1}
    ).to_list(1000)

    # ── 1. REVENUE ──────────────────────────────────────────
    active_bookings = [b for b in bookings if b["status"] in ("PROVISIONAL", "APPROVED", "CONFIRMED")]
    total_revenue = sum(b.get("sale_value_inr", 0) for b in active_bookings)
    confirmed_revenue = sum(b.get("sale_value_inr", 0) for b in active_bookings if b["status"] == "CONFIRMED")
    pipeline_revenue = total_revenue - confirmed_revenue
    total_collected = sum(m["amount_inr"] for m in milestones if m["status"] == "PAID")
    total_collectible = sum(m["amount_inr"] for m in milestones)
    avg_discount = (
        sum(b.get("discount_pct", 0) for b in active_bookings) / len(active_bookings)
        if active_bookings else 0
    )

    revenue = {
        "total_sales_inr": total_revenue,
        "confirmed_inr": confirmed_revenue,
        "pipeline_inr": pipeline_revenue,
        "avg_discount_pct": round(avg_discount, 1),
        "total_collected_inr": total_collected,
        "total_collectible_inr": total_collectible,
        "collection_rate_pct": round(total_collected / total_collectible * 100, 1) if total_collectible else 0,
    }

    # ── 2. BOOKINGS ─────────────────────────────────────────
    booking_status_counts = {}
    for b in bookings:
        bs = b["status"]
        booking_status_counts[bs] = booking_status_counts.get(bs, 0) + 1

    recent_bookings = sorted(
        [b for b in bookings if b["status"] in ("PROVISIONAL", "APPROVED", "CONFIRMED")],
        key=lambda x: x.get("created_at", ""),
        reverse=True,
    )[:5]

    bookings_panel = {
        "total": len(bookings),
        "provisional": booking_status_counts.get("PROVISIONAL", 0),
        "approved": booking_status_counts.get("APPROVED", 0),
        "confirmed": booking_status_counts.get("CONFIRMED", 0),
        "cancelled": booking_status_counts.get("CANCELLED", 0),
        "recent": [
            {"client": b.get("client_name", ""), "plot_no": b.get("plot_no"),
             "value_inr": b.get("sale_value_inr", 0), "status": b["status"]}
            for b in recent_bookings
        ],
    }

    # ── 3. INVENTORY ────────────────────────────────────────
    status_counts = {}
    available_value = 0
    for p in plots:
        ss = p.get("sales_status", "AVAILABLE")
        status_counts[ss] = status_counts.get(ss, 0) + 1
        if ss == "AVAILABLE":
            available_value += p.get("asking_price_inr", 0) or 0

    inventory = {
        "total": len(plots),
        "available": status_counts.get("AVAILABLE", 0),
        "reserved": status_counts.get("RESERVED", 0),
        "booked": status_counts.get("BOOKED", 0),
        "sold": status_counts.get("SOLD", 0),
        "under_construction": status_counts.get("UNDER_CONSTRUCTION", 0),
        "completed": status_counts.get("COMPLETED", 0),
        "available_value_inr": available_value,
        "absorption_rate_pct": round(
            (len(plots) - status_counts.get("AVAILABLE", 0)) / len(plots) * 100, 1
        ) if plots else 0,
    }

    # ── 4. CONSTRUCTION ─────────────────────────────────────
    stages_by_project = {}
    for s in all_stages:
        pid = s["project_id"]
        if pid not in stages_by_project:
            stages_by_project[pid] = []
        stages_by_project[pid].append(s)

    project_health = []
    total_progress = 0
    for p in projects:
        pid = p["id"]
        pstages = stages_by_project.get(pid, [])
        delayed = sum(1 for s in pstages if s.get("status") == "DELAYED")
        completed = sum(1 for s in pstages if s.get("status") == "COMPLETED")
        budget = p.get("budget_inr", 0)
        spent = p.get("actual_spent_inr", 0)
        budget_pct = round(spent / budget * 100, 1) if budget else 0
        prog = p.get("progress_pct", 0)
        total_progress += prog

        health = "GREEN"
        if delayed > 2 or budget_pct > 90:
            health = "RED"
        elif delayed > 0 or budget_pct > 75:
            health = "AMBER"

        project_health.append({
            "id": pid, "name": p.get("name", ""), "client": p.get("client_name", ""),
            "plot": p.get("plot_number", ""), "villa": p.get("villa_type", ""),
            "progress": prog, "status": p.get("status", ""),
            "budget_inr": budget, "spent_inr": spent, "budget_pct": budget_pct,
            "total_stages": len(pstages), "completed_stages": completed,
            "delayed_stages": delayed, "health": health,
            "handover": p.get("target_handover_date"),
        })

    project_health.sort(key=lambda x: {"RED": 0, "AMBER": 1, "GREEN": 2}.get(x["health"], 3))
    avg_progress = round(total_progress / len(projects), 1) if projects else 0

    construction = {
        "total_projects": len(projects),
        "in_progress": sum(1 for p in projects if p.get("status") == "IN_PROGRESS"),
        "avg_progress_pct": avg_progress,
        "projects": project_health,
    }

    # ── 5. DELAYED PROJECTS ─────────────────────────────────
    delayed_stages_list = [s for s in all_stages if s.get("status") == "DELAYED"]
    delayed_by_project = {}
    for s in delayed_stages_list:
        pid = s["project_id"]
        if pid not in delayed_by_project:
            delayed_by_project[pid] = {"stages": [], "project_name": ""}
        delayed_by_project[pid]["stages"].append({
            "name": s.get("name", ""),
            "planned_end": s.get("planned_end"),
            "reason": s.get("delay_reason", ""),
        })

    for pid, info in delayed_by_project.items():
        for p in projects:
            if p["id"] == pid:
                info["project_name"] = p.get("name", "")
                info["client"] = p.get("client_name", "")
                break

    delayed = {
        "total_delayed_stages": len(delayed_stages_list),
        "affected_projects": len(delayed_by_project),
        "details": [
            {"project": v["project_name"], "client": v.get("client", ""),
             "stages": v["stages"]}
            for v in delayed_by_project.values()
        ],
    }

    # ── 6. APPROVAL QUEUE ───────────────────────────────────
    approval_items = []
    for ba in booking_approvals:
        bk = next((b for b in bookings if b["id"] == ba["booking_id"]), {})
        approval_items.append({
            "type": "BOOKING", "level": ba.get("current_level", 1),
            "client": bk.get("client_name", ""), "plot_no": bk.get("plot_no"),
            "value_inr": bk.get("sale_value_inr", 0),
        })
    for dr in discount_requests:
        bk = next((b for b in bookings if b["id"] == dr.get("booking_id")), {})
        approval_items.append({
            "type": "DISCOUNT", "level": 1,
            "client": bk.get("client_name", ""),
            "plot_no": bk.get("plot_no"),
            "value_inr": dr.get("requested_discount_pct", 0),
        })
    for pa in po_approvals:
        approval_items.append({
            "type": "PROCUREMENT", "level": 1,
            "client": pa.get("description", ""),
            "plot_no": None,
            "value_inr": pa.get("amount", 0),
        })

    approvals = {
        "total": len(approval_items),
        "bookings": len(booking_approvals),
        "discounts": len(discount_requests),
        "procurement": len(po_approvals),
        "items": approval_items[:10],
    }

    # ── 7. SNAGS ────────────────────────────────────────────
    snag_by_sev = {}
    for sn in snags:
        sv = sn.get("severity", "MEDIUM")
        snag_by_sev[sv] = snag_by_sev.get(sv, 0) + 1

    snags_panel = {
        "total": len(snags),
        "critical": snag_by_sev.get("CRITICAL", 0),
        "high": snag_by_sev.get("HIGH", 0),
        "medium": snag_by_sev.get("MEDIUM", 0),
        "low": snag_by_sev.get("LOW", 0),
        "items": [
            {"title": sn.get("title", ""), "severity": sn.get("severity", ""),
             "location": sn.get("location", ""), "project_id": sn.get("project_id", "")}
            for sn in snags[:10]
        ],
    }

    # ── 8. PROCUREMENT ──────────────────────────────────────
    procurement = {
        "pending_approvals": len(po_approvals),
        "total_pending_value": sum(pa.get("amount", 0) for pa in po_approvals),
    }

    # ── 9. CASH COLLECTION ──────────────────────────────────
    paid_milestones = [m for m in milestones if m["status"] == "PAID"]
    pending_milestones = [m for m in milestones if m["status"] == "PENDING"]
    overdue_milestones = [m for m in milestones if m["status"] == "OVERDUE"]

    cash = {
        "total_collectible_inr": total_collectible,
        "collected_inr": total_collected,
        "pending_inr": sum(m["amount_inr"] for m in pending_milestones),
        "overdue_inr": sum(m["amount_inr"] for m in overdue_milestones),
        "overdue_count": len(overdue_milestones),
        "collection_rate_pct": round(total_collected / total_collectible * 100, 1) if total_collectible else 0,
    }

    # ── 10. UPCOMING MILESTONES ─────────────────────────────
    upcoming = sorted(
        [m for m in milestones if m["status"] == "PENDING"],
        key=lambda x: x.get("due_date") or "9999",
    )[:8]

    upcoming_panel = [
        {"milestone": m.get("milestone_name", ""), "client": m.get("client_name", ""),
         "plot_no": m.get("plot_no"), "amount_inr": m.get("amount_inr", 0),
         "due_date": m.get("due_date")}
        for m in upcoming
    ]

    # ── ACTION ITEMS ────────────────────────────────────────
    actions = []
    if approvals["total"] > 0:
        actions.append({
            "priority": "HIGH", "type": "APPROVALS",
            "title": f"{approvals['total']} pending approvals",
            "detail": f"{approvals['bookings']} bookings, {approvals['discounts']} discounts",
        })
    if delayed["total_delayed_stages"] > 0:
        actions.append({
            "priority": "CRITICAL", "type": "DELAYS",
            "title": f"{delayed['total_delayed_stages']} stages delayed",
            "detail": f"Across {delayed['affected_projects']} projects",
        })
    if snags_panel["critical"] > 0:
        actions.append({
            "priority": "CRITICAL", "type": "SNAGS",
            "title": f"{snags_panel['critical']} critical snags",
            "detail": "Require immediate attention",
        })
    if cash["overdue_count"] > 0:
        actions.append({
            "priority": "HIGH", "type": "COLLECTIONS",
            "title": f"{cash['overdue_count']} overdue payments",
            "detail": f"₹{cash['overdue_inr']/1e7:.2f} Cr outstanding",
        })

    # Leads summary
    active_leads = sum(1 for l in leads if l.get("status") not in ("BOOKING", "LOST"))
    lead_summary = {"total": len(leads), "active": active_leads}

    return {
        "revenue": revenue,
        "bookings": bookings_panel,
        "inventory": inventory,
        "construction": construction,
        "delayed": delayed,
        "approvals": approvals,
        "snags": snags_panel,
        "procurement": procurement,
        "cash": cash,
        "upcoming_milestones": upcoming_panel,
        "actions": actions,
        "leads": lead_summary,
    }

