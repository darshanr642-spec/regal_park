"""Branded PDF report generation (reportlab) — internal roles only."""
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from auth_utils import require_internal
from config import ROOT_DIR, db
from models import User

router = APIRouter()

GOLD = rl_colors.HexColor("#B8860B")
CHARCOAL = rl_colors.HexColor("#1A1A1A")
MUTED = rl_colors.HexColor("#7A6F5D")
IVORY = rl_colors.HexColor("#F0EDE8")

LOGO_PATH = ROOT_DIR / "assets" / "sterlitee_logo.png"


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
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title=title)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=CHARCOAL, spaceAfter=4)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=MUTED, spaceAfter=2)
    brand = ParagraphStyle("brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, alignment=2)

    header_cells = [Paragraph("STERLITEE DEVELOPERS LLP &nbsp;·&nbsp; REGAL PARK VILLAS", brand)]
    col_widths = [None]
    if LOGO_PATH.exists():
        header_cells.insert(0, RLImage(str(LOGO_PATH), width=14 * mm, height=14 * mm))
        col_widths = [18 * mm, None]
    header = Table([header_cells], colWidths=col_widths, hAlign="LEFT")
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    full_story = [
        header,
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


@router.get("/reports/{kind}")
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
