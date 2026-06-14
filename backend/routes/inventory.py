"""Inventory Command Center API.

Aggregates all 251 plots with enriched customer, booking,
construction and revenue data for the executive heatmap view.
"""
from fastapi import APIRouter, Depends

from auth_utils import get_current_user, require_roles
from config import db
from models import User

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/command-center")
async def command_center(user: User = Depends(require_roles({"ADMIN", "COO", "SALES_MANAGER", "PROJECT_DIRECTOR"}))):
    """Return full inventory with KPIs, filters metadata, and enriched plot data."""

    # ── Fetch all data in parallel ───────────────────────────
    plots = await db.plots.find({}, {"_id": 0}).sort("plot_no", 1).to_list(300)
    bookings = await db.bookings.find(
        {"status": {"$in": ["PROVISIONAL", "APPROVED", "CONFIRMED"]}},
        {"_id": 0, "plot_no": 1, "client_name": 1, "status": 1, "sale_value_inr": 1,
         "discount_pct": 1, "elevation_type": 1, "booking_amount_inr": 1, "created_at": 1},
    ).to_list(500)
    projects = await db.projects.find(
        {},
        {"_id": 0, "id": 1, "plot_no": 1, "progress_pct": 1, "status": 1, "name": 1,
         "client_name": 1, "villa_type": 1},
    ).to_list(300)
    milestones = await db.payment_milestones.find(
        {},
        {"_id": 0, "project_id": 1, "amount_inr": 1, "status": 1},
    ).to_list(2000)
    pricing = await db.pricing.find({}, {"_id": 0}).to_list(20)

    # ── Index lookups ────────────────────────────────────────
    booking_by_plot: dict = {}
    for b in bookings:
        pn = b.get("plot_no")
        if pn and pn not in booking_by_plot:
            booking_by_plot[pn] = b

    project_by_plot: dict = {}
    for p in projects:
        pn = p.get("plot_no")
        if pn:
            project_by_plot[pn] = p

    # Revenue by project
    revenue_by_project: dict = {}
    for m in milestones:
        pid = m.get("project_id")
        if pid not in revenue_by_project:
            revenue_by_project[pid] = {"total": 0, "collected": 0}
        revenue_by_project[pid]["total"] += m.get("amount_inr", 0)
        if m.get("status") == "PAID":
            revenue_by_project[pid]["collected"] += m.get("amount_inr", 0)

    # Pricing by elevation
    pricing_by_elev: dict = {}
    for pr in pricing:
        pricing_by_elev[pr.get("elevation_type", "")] = pr

    # ── Build enriched plot list ─────────────────────────────
    enriched: list = []
    kpi_available_value = 0.0
    kpi_sold_value = 0.0
    kpi_collected = 0.0
    kpi_total_value = 0.0
    status_counts: dict = {}
    elevation_set: set = set()
    facing_set: set = set()

    for plot in plots:
        pn = plot["plot_no"]
        ss = plot.get("sales_status", "AVAILABLE")
        elev = plot.get("elevation_type", "")
        facing = plot.get("facing", "")
        is_corner = plot.get("is_corner", False)
        asking = plot.get("asking_price_inr", 0) or 0

        # Count statuses
        status_counts[ss] = status_counts.get(ss, 0) + 1
        elevation_set.add(elev)
        facing_set.add(facing)

        # Booking / customer info
        bk = booking_by_plot.get(pn, {})
        proj = project_by_plot.get(pn)

        # Revenue
        rev = {"total": 0, "collected": 0}
        if proj:
            rev = revenue_by_project.get(proj["id"], rev)

        # Pricing
        pr = pricing_by_elev.get(elev, {})

        # KPIs
        sale_val = bk.get("sale_value_inr", 0) or asking
        kpi_total_value += sale_val
        if ss == "AVAILABLE":
            kpi_available_value += asking
        elif ss in ("SOLD", "BOOKED", "UNDER_CONSTRUCTION", "CONFIRMED"):
            kpi_sold_value += sale_val
            kpi_collected += rev.get("collected", 0)

        enriched.append({
            "plot_no": pn,
            "elevation_type": elev,
            "dimension_ft": plot.get("dimension_ft", ""),
            "facing": facing,
            "is_corner": is_corner,
            "sales_status": ss,
            "asking_price_inr": asking,
            "premium_pct": plot.get("premium_pct", 0),
            # Customer / booking
            "client_name": bk.get("client_name") or (proj.get("client_name") if proj else None),
            "booking_status": bk.get("status"),
            "sale_value_inr": bk.get("sale_value_inr"),
            "discount_pct": bk.get("discount_pct", 0),
            "booking_amount_inr": bk.get("booking_amount_inr"),
            # Construction
            "project_id": proj["id"] if proj else None,
            "project_name": proj["name"] if proj else None,
            "construction_progress": proj["progress_pct"] if proj else 0,
            "construction_status": proj["status"] if proj else None,
            # Revenue
            "revenue_total": rev["total"],
            "revenue_collected": rev["collected"],
            # Pricing reference
            "landowner_share_pct": pr.get("landowner_share_pct", 0),
            "developer_share_pct": pr.get("developer_share_pct", 0),
        })

    # ── KPIs ─────────────────────────────────────────────────
    total = len(plots)
    sold_count = sum(1 for p in plots if p.get("sales_status") in ("SOLD", "BOOKED", "UNDER_CONSTRUCTION", "CONFIRMED"))
    conversion_rate = round((sold_count / total * 100), 1) if total else 0

    kpis = {
        "total_plots": total,
        "available_count": status_counts.get("AVAILABLE", 0),
        "sold_count": sold_count,
        "available_inventory_value": kpi_available_value,
        "sold_inventory_value": kpi_sold_value,
        "revenue_realized": kpi_collected,
        "conversion_rate": conversion_rate,
        "total_inventory_value": kpi_total_value,
    }

    # ── Filter metadata ──────────────────────────────────────
    filters_meta = {
        "elevations": sorted(elevation_set),
        "facings": sorted(facing_set),
        "statuses": sorted(status_counts.keys()),
        "status_counts": status_counts,
        "has_corner_plots": any(p.get("is_corner") for p in plots),
    }

    return {
        "kpis": kpis,
        "filters": filters_meta,
        "plots": enriched,
    }
