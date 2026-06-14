"""Landowner Dashboard — Revenue, inventory, and compliance for land partners.

Each LANDOWNER user sees only the plots assigned to them via landowner_id.
Admin can assign plots to landowners via PATCH /api/landowner/assign.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

from auth_utils import get_current_user, require_roles
from config import db
from models import User

router = APIRouter(prefix="/landowner", tags=["Landowner Dashboard"])

LANDOWNER_ROLES = {"LANDOWNER", "ADMIN"}


@router.get("/dashboard")
async def landowner_dashboard(user: User = Depends(require_roles(LANDOWNER_ROLES))):
    """Full landowner dashboard — plots, revenue, customers, heatmap data."""

    # ── Determine which plots belong to this landowner ───────
    if user.role == "ADMIN":
        # Admin sees all plots (for demo / support)
        query = {}
    else:
        query = {"landowner_id": user.id}

    plots = await db.plots.find(query, {"_id": 0}).sort("plot_no", 1).to_list(500)

    if not plots and user.role == "LANDOWNER":
        # First login: auto-assign ALL plots to this landowner (single-landowner setup)
        await db.plots.update_many(
            {"landowner_id": {"$exists": False}},
            {"$set": {"landowner_id": user.id}},
        )
        await db.plots.update_many(
            {"landowner_id": None},
            {"$set": {"landowner_id": user.id}},
        )
        plots = await db.plots.find(
            {"landowner_id": user.id}, {"_id": 0}
        ).sort("plot_no", 1).to_list(500)

    plot_nos = [p["plot_no"] for p in plots]

    # ── Fetch bookings for these plots ───────────────────────
    bookings = await db.bookings.find(
        {"plot_no": {"$in": plot_nos}},
        {"_id": 0, "id": 1, "plot_no": 1, "client_name": 1, "client_phone": 1,
         "client_email": 1, "sale_value_inr": 1, "discount_pct": 1,
         "status": 1, "booking_amount_inr": 1, "created_at": 1,
         "elevation_type": 1},
    ).to_list(500)

    booking_by_plot = {}
    for b in bookings:
        pn = b.get("plot_no")
        if pn and pn not in booking_by_plot:
            booking_by_plot[pn] = b

    # ── Fetch projects for these plots ───────────────────────
    projects = await db.projects.find(
        {"plot_no": {"$in": plot_nos}},
        {"_id": 0, "id": 1, "plot_no": 1, "name": 1, "progress_pct": 1,
         "status": 1, "client_name": 1},
    ).to_list(200)

    project_by_plot = {}
    for p in projects:
        pn = p.get("plot_no")
        if pn:
            project_by_plot[pn] = p

    # ── Revenue: payment milestones ──────────────────────────
    project_ids = [p["id"] for p in projects]
    milestones = await db.payment_milestones.find(
        {"project_id": {"$in": project_ids}} if project_ids else {"_no_match": True},
        {"_id": 0, "project_id": 1, "milestone_name": 1, "amount_inr": 1,
         "status": 1, "due_date": 1, "plot_no": 1},
    ).to_list(2000)

    rev_by_project = {}
    for m in milestones:
        pid = m["project_id"]
        if pid not in rev_by_project:
            rev_by_project[pid] = {"total": 0, "collected": 0, "pending": 0}
        rev_by_project[pid]["total"] += m.get("amount_inr", 0)
        if m.get("status") == "PAID":
            rev_by_project[pid]["collected"] += m.get("amount_inr", 0)
        else:
            rev_by_project[pid]["pending"] += m.get("amount_inr", 0)

    # ── Pricing for share split ──────────────────────────────
    pricing = await db.pricing.find({}, {"_id": 0}).to_list(20)
    pricing_by_elev = {pr.get("elevation_type", ""): pr for pr in pricing}

    # ── Compliance docs ──────────────────────────────────────
    compliance_docs = await db.documents.find(
        {"category": {"$in": ["COMPLIANCE", "LEGAL", "APPROVAL", "NOC"]}},
        {"_id": 0, "id": 1, "file_name": 1, "category": 1, "description": 1,
         "file_url": 1, "uploaded_at": 1},
    ).to_list(100)

    # ── Build enriched plot list ─────────────────────────────
    enriched = []
    status_counts = {}
    total_asking = 0
    total_sold_value = 0
    total_collected = 0
    total_pending = 0
    customers = []

    for plot in plots:
        pn = plot["plot_no"]
        ss = plot.get("sales_status", "AVAILABLE")
        elev = plot.get("elevation_type", "")
        asking = plot.get("asking_price_inr", 0) or 0

        status_counts[ss] = status_counts.get(ss, 0) + 1
        total_asking += asking

        bk = booking_by_plot.get(pn, {})
        proj = project_by_plot.get(pn)
        pr = pricing_by_elev.get(elev, {})

        # Revenue for this plot
        rev = {"total": 0, "collected": 0, "pending": 0}
        if proj:
            rev = rev_by_project.get(proj["id"], rev)

        sale_val = bk.get("sale_value_inr", 0) or 0
        if ss in ("SOLD", "BOOKED", "UNDER_CONSTRUCTION", "CONFIRMED"):
            total_sold_value += sale_val or asking
            total_collected += rev["collected"]
            total_pending += rev["pending"]

        # Track customers
        client_name = bk.get("client_name") or (proj.get("client_name") if proj else None)
        if client_name:
            customers.append({
                "plot_no": pn,
                "name": client_name,
                "phone": bk.get("client_phone", ""),
                "email": bk.get("client_email", ""),
                "status": ss,
                "sale_value_inr": sale_val,
                "collected_inr": rev["collected"],
            })

        enriched.append({
            "plot_no": pn,
            "elevation_type": elev,
            "dimension_ft": plot.get("dimension_ft", ""),
            "facing": plot.get("facing", ""),
            "is_corner": plot.get("is_corner", False),
            "sales_status": ss,
            "asking_price_inr": asking,
            "premium_pct": plot.get("premium_pct", 0),
            "client_name": client_name,
            "sale_value_inr": sale_val,
            "booking_status": bk.get("status"),
            "construction_progress": proj["progress_pct"] if proj else 0,
            "construction_status": proj["status"] if proj else None,
            "revenue_total": rev["total"],
            "revenue_collected": rev["collected"],
            "revenue_pending": rev["pending"],
            "landowner_share_pct": pr.get("landowner_share_pct", 30),
            "developer_share_pct": pr.get("developer_share_pct", 70),
        })

    # ── KPIs ─────────────────────────────────────────────────
    total = len(plots)
    available = status_counts.get("AVAILABLE", 0)
    sold_count = total - available

    # Per-plot weighted landowner share from pricing database
    landowner_revenue = 0
    landowner_collected = 0
    landowner_pending = 0
    share_sum = 0
    share_count = 0

    for ep in enriched:
        share = ep.get("landowner_share_pct", 0)
        sale_val = ep.get("sale_value_inr", 0) or 0
        rev_collected = ep.get("revenue_collected", 0)
        rev_pending = ep.get("revenue_pending", 0)
        ss = ep.get("sales_status", "AVAILABLE")

        if share > 0:
            share_sum += share
            share_count += 1

        if ss in ("SOLD", "BOOKED", "UNDER_CONSTRUCTION", "CONFIRMED"):
            landowner_revenue += (sale_val or ep.get("asking_price_inr", 0)) * share / 100
            landowner_collected += rev_collected * share / 100
            landowner_pending += rev_pending * share / 100

    avg_share = round(share_sum / share_count, 1) if share_count else 0

    kpis = {
        "total_plots": total,
        "available": available,
        "booked": status_counts.get("BOOKED", 0),
        "sold": status_counts.get("SOLD", 0),
        "under_construction": status_counts.get("UNDER_CONSTRUCTION", 0),
        "completed": status_counts.get("COMPLETED", 0),
        "total_inventory_value": total_asking,
        "total_sold_value": total_sold_value,
        "total_collected": total_collected,
        "total_pending": total_pending,
        "landowner_share_pct": avg_share,
        "landowner_revenue_inr": round(landowner_revenue, 2),
        "landowner_collected_inr": round(landowner_collected, 2),
        "landowner_pending_inr": round(landowner_pending, 2),
        "absorption_rate": round(sold_count / total * 100, 1) if total else 0,
    }

    # ── Filter metadata ──────────────────────────────────────
    facings = sorted(set(p.get("facing", "") for p in plots))
    elevations = sorted(set(p.get("elevation_type", "") for p in plots))

    return {
        "kpis": kpis,
        "plots": enriched,
        "customers": customers,
        "compliance_docs": compliance_docs,
        "filters": {
            "facings": facings,
            "elevations": elevations,
            "statuses": sorted(status_counts.keys()),
            "status_counts": status_counts,
        },
    }
