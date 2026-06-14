"""Idempotent database seeding + base64→GridFS migration."""
import base64
import re
import uuid
from datetime import datetime, timezone

from auth_utils import hash_pw
from config import SEED_DEMO_DATA, db, fs_bucket, log

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
EMAIL_DOMAIN = "regal" + "park" + ".com"

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
    ("Anita Krishnan", "Architect", "Studio Atelier", "+91 98450 11004", "anita@studioatelier.in", "Architectural design & approvals"),
    ("Dr. R. Subramanian", "Structural Engineer", "SubraCons", "+91 98450 22001", "subra@subracons.in", "RCC structural design"),
    ("Sandeep Iyer", "MEP Consultant", "Aurum MEP", "+91 98450 11006", "sandeep@aurummep.in", "MEP design & supervision"),
    ("Priya Menon", "Interior Designer", "Maison Privée", "+91 98450 11007", "priya@maisonprivee.in", "Interior styling & fitouts"),
    ("Aarav Verma", "Landscape Architect", "Verdant Designs", "+91 98450 22003", "aarav@verdant.in", "Landscape & pool design"),
    ("Sai Constructions", "Civil Contractor", "Sai Constructions Pvt Ltd", "+91 98450 33001", "office@saiconstructions.in", "Civil & RCC execution"),
    ("Aurum MEP", "MEP Contractor", "Aurum MEP Services", "+91 98450 33002", "projects@aurummep.in", "Electrical & plumbing"),
    ("Stonex India", "Marble Contractor", "Stonex India Pvt Ltd", "+91 98450 33003", "sales@stonex.in", "Italian marble supply & laying"),
    ("Maison Privée", "Carpentry Contractor", "Maison Privée Studio", "+91 98450 33004", "studio@maisonprivee.in", "Doors, wardrobes, modular kitchen"),
    ("Asian Paints Royale", "Painting Contractor", "Asian Paints Signature", "+91 98450 33005", "signature@asianpaints.in", "Interior & exterior painting"),
    ("Crestron India", "Automation Contractor", "Crestron India", "+91 98450 33006", "india@crestron.in", "Home automation KNX"),
    ("Aquaa Pools", "Pool Contractor", "Aquaa Pool Tech", "+91 98450 33007", "build@aquaapools.in", "Swimming pool construction"),
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

# ---- v2: Purchase orders (PO lifecycle) ----
PO_DEFS = [
    # material, vendor, qty, unit, rate, status, requested_by, expected_delivery, notes
    ("Waterproofing Chemical (Dr. Fixit LW+)", "Dr. Fixit", 1850, "kg", 185, "REQUESTED", "Karthik Reddy", "2026-06-20", "Required before terrace waterproofing restart"),
    ("Vitrified Tiles 800x800 batch-2", "Kajaria Eternity", 900, "sqft", 145, "APPROVED", "Mahesh Rao", "2026-06-25", "Second batch for upper floors"),
    ("CP Fittings - Kohler Purist series", "Kohler India", 28, "nos", 42000, "ORDERED", "Mahesh Rao", "2026-07-01", "Client-approved finish: brushed nickel"),
    ("Royale Luxury Emulsion - Ivory Silk", "Asian Paints", 540, "litres", 620, "REQUESTED", "Vikram Shetty", "2026-07-10", None),
    ("Italian Marble Statuario batch-3", "Stonex India", 1050, "sqft", 850, "DELIVERED", "Mahesh Rao", "2026-05-14", "Final foyer batch — received at site"),
]

# ---- v2: Approval workflow requests ----
APPROVAL_REQ_DEFS = [
    # title, description, category, requested_by, assignee_role, status, decision_by, decision_note
    ("Sanitaryware Selection - Kohler Purist", "Final approval of Kohler Purist series in brushed nickel for all 6 bathrooms. Catalogue shared with the client on site visit.", "CLIENT_SELECTION", "Priya Menon", "CLIENT", "PENDING", None, None),
    ("Budget Revision - Waterproofing", "Monsoon delay requires premium membrane upgrade. Additional INR 1.2L over approved BOQ line.", "BUDGET", "Sneha Pillai", "PROJECT_DIRECTOR", "PENDING", None, None),
    ("Masonry Stage Sign-off", "Masonry at 95% — request stage sign-off to release Birla Masonry RA bill #3.", "STAGE_SIGNOFF", "Karthik Reddy", "PROJECT_MANAGER", "APPROVED", "Vikram Shetty", "Verified on site 12 May. Approved."),
    ("Facade Design Change - Porch Column Cladding", "Client requested travertine cladding instead of paint finish on porch columns.", "DESIGN", "Anita Krishnan", "PROJECT_DIRECTOR", "REJECTED", "Rajeev Nair", "Travertine lead time 8 weeks risks handover date. Revisit post-handover."),
]

# ---- v2: Stage checklist templates ----
CHECKLIST_TEMPLATE_DEFS = [
    ("Foundation", [
        "PCC level & thickness verified against drawing",
        "Reinforcement diameter, spacing and cover as per BBS",
        "Shuttering alignment and water-tightness checked",
        "Anti-termite treatment applied and recorded",
        "Concrete cube samples cast (7-day & 28-day)",
    ]),
    ("Slab", [
        "Slab reinforcement checked against structural drawing",
        "Electrical conduits and fan hooks placed before pour",
        "Cover blocks installed at specified spacing",
        "Concrete grade verified from RMC batch slip",
        "Curing regime started within 24 hrs of pour",
    ]),
    ("Masonry", [
        "Block work alignment within ±5mm per 3m",
        "RCC lintels with correct bearing on openings",
        "Sill level and lintel level bands cast",
        "Door/window opening dimensions verified",
        "Raking of joints done for plaster key",
    ]),
    ("Electrical Chasing", [
        "Conduit routing matches MEP drawing",
        "Chase depth within 1/3 of wall thickness",
        "DB locations and heights verified",
        "Conduits clamped before refilling chases",
    ]),
    ("Plumbing Chasing", [
        "Pipe routing matches plumbing drawing",
        "Pressure test 5kg/cm² held for 24 hrs",
        "Slope verified for all drainage lines",
        "Sleeves provided at all wall/slab crossings",
    ]),
    ("Plastering", [
        "Surface hacked / chicken-mesh fixed at RCC-masonry junctions",
        "Plumb and level checked with 2m straight edge",
        "Thickness within 12-15mm internal / 18-20mm external",
        "Curing for minimum 7 days recorded",
    ]),
    ("Waterproofing", [
        "Surface preparation — cracks treated and cleaned",
        "Membrane / coating applied to specified DFT",
        "Upturns taken 300mm above finished floor level",
        "Ponding test 48 hrs passed with no seepage",
    ]),
    ("Flooring", [
        "Marble/tile batch shade-matched and approved",
        "Level and slope verified before laying",
        "Joint thickness uniform; spacers used",
        "Hollowness check by tapping — no hollow tiles",
        "Protection sheet laid after installation",
    ]),
]


async def seed_db():
    """Idempotent seed of users + Villa Aurelia full dataset."""
    if await db.users.count_documents({}) > 0:
        log.info("Seed: users already present, skipping core seed.")
        return

    log.warning(
        "⚠️  SEED_DEMO_DATA is enabled — inserting demo users with default passwords. "
        "Disable in production by setting SEED_DEMO_DATA=false."
    )

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

    boq_docs = []
    for desc, cat, unit, qty, rate, amt, vendor, budget, spent, pay in BOQ_DEFS:
        boq_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "description": desc,
            "category": cat, "unit": unit, "quantity": float(qty), "rate_inr": float(rate),
            "amount_inr": float(amt), "vendor": vendor, "approved_budget_inr": float(budget),
            "actual_spent_inr": float(spent), "payment_status": pay,
        })
    await db.boq.insert_many(boq_docs)

    mat_docs = []
    for name, unit, req, ordered, received, sup, po, dd, inv, pay in MATERIAL_DEFS:
        mat_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "name": name, "unit": unit,
            "required_qty": float(req), "ordered_qty": float(ordered), "received_qty": float(received),
            "supplier": sup, "po_number": po, "delivery_date": dd,
            "invoice_amount_inr": float(inv), "payment_status": pay,
        })
    await db.materials.insert_many(mat_docs)

    bill_docs = []
    for c, wp, val, comp, ra, ret, adv, ded, net, app_s, pay_s in BILL_DEFS:
        bill_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "contractor_name": c,
            "work_package": wp, "boq_value_inr": float(val), "work_completed_pct": float(comp),
            "ra_bill_amount_inr": float(ra), "retention_inr": float(ret), "advance_inr": float(adv),
            "deductions_inr": float(ded), "net_payable_inr": float(net),
            "approval_status": app_s, "payment_status": pay_s,
        })
    await db.bills.insert_many(bill_docs)

    q_docs = []
    for ct, item, res, resp, dl, rect in QUALITY_DEFS:
        q_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "checklist_type": ct, "item": item,
            "result": res,
            "remarks": "Rework required" if res == "FAIL" else ("Awaiting test" if res == "PENDING" else "Verified"),
            "responsible": resp, "deadline": dl, "rectification_required": rect,
        })
    await db.quality.insert_many(q_docs)

    snag_docs = []
    for room, issue, cat, contractor, dl, status_v in SNAG_DEFS:
        snag_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "room": room, "issue": issue,
            "category": cat, "assigned_contractor": contractor, "deadline": dl, "status": status_v,
        })
    await db.snags.insert_many(snag_docs)

    team_docs = []
    for name, role, company, phone, email, scope in TEAM_DEFS:
        team_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "name": name, "role": role,
            "company": company, "phone": phone, "email": email,
            "scope_of_work": scope, "status": "Active",
        })
    await db.team.insert_many(team_docs)

    app_docs = []
    for name, auth, status_v, date in APPROVAL_DEFS:
        app_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "name": name,
            "authority": auth, "status": status_v, "date": date,
        })
    await db.approvals.insert_many(app_docs)

    report_docs = []
    for d in [
        ("2026-05-10", 42, "Plastering on first floor north wing", "Cement 50 bags, M-sand 4 cum", "Concrete mixer, hoist", "Minor scaffolding shortage", "Continue plastering south wing", "Sunny, 32°C", "All workers wearing PPE"),
        ("2026-05-11", 45, "Plastering south wing, electrical chasing GF", "Cement 60 bags, conduits 80 nos", "Hoist, hilti drill", None, "Begin waterproofing prep on terrace", "Sunny, 33°C", "Toolbox talk conducted"),
        ("2026-05-12", 48, "Started terrace waterproofing prep", "Waterproofing chemical 200kg", "Compressor", "Rain forecast may delay", "Apply 1st coat of waterproofing", "Cloudy, 30°C", "Safety harness checks done"),
        ("2026-05-13", 38, "Waterproofing 1st coat applied", "—", "Compressor", "Light rain stopped work post 3pm", "Apply 2nd coat tomorrow", "Light rain, 28°C", "Slip hazard near terrace - cordoned"),
        ("2026-05-14", 50, "Plastering pool deck, MEP final routing", "Marble batch-2 received 1050 sqft", "Marble cutter, hoist", None, "Begin marble laying foyer", "Sunny, 34°C", "All clear"),
    ]:
        date, lab, work, mats, mach, iss, plan, weather, safety = d
        report_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "date": date, "labour_count": lab,
            "work_completed": work, "materials_received": mats, "machinery_used": mach,
            "issues": iss, "tomorrow_plan": plan, "weather": weather,
            "safety_observations": safety, "submitted_by": se["full_name"],
        })
    await db.reports.insert_many(report_docs)

    # ---- Additional villas (multi-project) ----
    EXTRA_VILLAS = [
        {
            "id": "villa-celeste-08", "name": "Villa Celeste", "plot_number": "Plot 08, Regal Park",
            "client_name": "Mr. Karthik Subbiah", "villa_type": "4BHK Premium Villa",
            "built_up_area_sqft": 5400, "start_date": "2025-09-15", "target_handover_date": "2027-02-28",
            "budget_inr": 28000000.0, "actual_spent_inr": 6800000.0, "progress_pct": 22.0,
            "project_manager": pm["full_name"], "site_engineer": se["full_name"],
            "consultants": ["Studio Atelier", "Aurum MEP"], "contractors": ["Sai Constructions", "Aurum MEP"],
            "hero_image_url": "https://images.pexels.com/photos/16573669/pexels-photo-16573669.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "IN_PROGRESS",
        },
        {
            "id": "villa-meridian-05", "name": "Villa Meridian", "plot_number": "Plot 05, Regal Park",
            "client_name": "Dr. Sneha & Mr. Rohit Kapoor", "villa_type": "6BHK Mansion with Spa",
            "built_up_area_sqft": 9200, "start_date": "2026-01-10", "target_handover_date": "2027-09-30",
            "budget_inr": 52000000.0, "actual_spent_inr": 2100000.0, "progress_pct": 8.0,
            "project_manager": pm["full_name"], "site_engineer": se["full_name"],
            "consultants": ["Studio Atelier", "Aurum MEP", "Maison Privée"], "contractors": ["Sai Constructions"],
            "hero_image_url": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "IN_PROGRESS",
        },
    ]
    await db.projects.insert_many(EXTRA_VILLAS)

    extra_stages = []
    for villa in EXTRA_VILLAS:
        prog = villa["progress_pct"]
        for i, (name, ps, pe, _, _, resp) in enumerate(STAGE_DEFS, start=1):
            if i > 12:
                break
            stage_pct = 100 if i * 8 < prog else (60 if i * 8 < prog + 12 else 0)
            status_v = "COMPLETED" if stage_pct == 100 else ("IN_PROGRESS" if stage_pct > 0 else "NOT_STARTED")
            extra_stages.append({
                "id": str(uuid.uuid4()), "project_id": villa["id"], "order": i, "name": name,
                "planned_start": ps, "planned_end": pe,
                "actual_start": ps if stage_pct > 0 else None,
                "actual_end": pe if stage_pct == 100 else None,
                "responsible": resp, "progress_pct": float(stage_pct), "status": status_v,
                "remarks": "On track" if status_v != "NOT_STARTED" else "Scheduled",
                "delay_reason": None,
            })
    if extra_stages:
        await db.stages.insert_many(extra_stages)

    # Sample documents (seeded as base64; migrate_base64_to_gridfs converts them)
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
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "title": title, "category": cat,
            "drawing_number": num, "revision": rev, "uploaded_by": "Anita Krishnan",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "file_data": base_pdf_b64,
            "file_name": f"{(num or title).replace(' ', '_').lower()}.pdf",
        })
    await db.documents.insert_many(doc_records)

    log.info("Seed: core complete (Villa Aurelia + 2 extra villas + sample documents).")


async def seed_v2():
    """Seed v2 collections (POs, approval requests, checklists) if empty."""
    now = datetime.now(timezone.utc).isoformat()

    if await db.purchase_orders.count_documents({}) == 0:
        po_docs = []
        for i, (mat, vendor, qty, unit, rate, status_v, req_by, edd, notes) in enumerate(PO_DEFS, start=101):
            history = [{"status": "REQUESTED", "by": req_by, "at": now, "note": notes}]
            chain = {"APPROVED": 1, "ORDERED": 2, "DELIVERED": 3}.get(status_v, 0)
            steps = ["APPROVED", "ORDERED", "DELIVERED"]
            actors = ["Vikram Shetty", "Mahesh Rao", "Karthik Reddy"]
            for s in range(chain):
                history.append({"status": steps[s], "by": actors[s], "at": now, "note": None})
            po_docs.append({
                "id": str(uuid.uuid4()), "project_id": PROJECT_ID,
                "po_number": f"PO-RPV-{i:03d}", "material_name": mat, "vendor": vendor,
                "quantity": float(qty), "unit": unit, "rate_inr": float(rate),
                "total_inr": round(qty * rate, 2), "status": status_v,
                "requested_by": req_by, "expected_delivery": edd, "notes": notes,
                "created_at": now, "history": history,
            })
        await db.purchase_orders.insert_many(po_docs)
        log.info("Seed v2: %d purchase orders.", len(po_docs))

    if await db.approval_requests.count_documents({}) == 0:
        req_docs = []
        for title, desc, cat, req_by, assignee, status_v, dec_by, dec_note in APPROVAL_REQ_DEFS:
            req_docs.append({
                "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "title": title,
                "description": desc, "category": cat, "requested_by": req_by,
                "assignee_role": assignee, "status": status_v,
                "decision_by": dec_by, "decision_note": dec_note,
                "created_at": now, "decided_at": now if dec_by else None,
            })
        await db.approval_requests.insert_many(req_docs)
        log.info("Seed v2: %d approval requests.", len(req_docs))

    if await db.checklist_templates.count_documents({}) == 0:
        tpl_docs = [
            {"id": str(uuid.uuid4()), "stage_name": name, "items": items}
            for name, items in CHECKLIST_TEMPLATE_DEFS
        ]
        await db.checklist_templates.insert_many(tpl_docs)
        log.info("Seed v2: %d checklist templates.", len(tpl_docs))

    if await db.stage_checklists.count_documents({}) == 0:
        tpls = {t["stage_name"]: t["items"] async for t in db.checklist_templates.find({})}
        cl_docs = []
        # Foundation — fully passed & signed off
        cl_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "stage_name": "Foundation",
            "items": [
                {"id": str(uuid.uuid4()), "text": t, "status": "PASS",
                 "checked_by": "Karthik Reddy", "checked_at": now, "remarks": "Verified"}
                for t in tpls.get("Foundation", [])
            ],
            "signed_off": True, "signed_off_by": "Vikram Shetty", "signed_off_at": now,
            "created_at": now,
        })
        # Masonry — in progress, mixed results
        masonry_status = ["PASS", "PASS", "PASS", "FAIL", "PENDING"]
        cl_docs.append({
            "id": str(uuid.uuid4()), "project_id": PROJECT_ID, "stage_name": "Masonry",
            "items": [
                {"id": str(uuid.uuid4()), "text": t,
                 "status": masonry_status[i] if i < len(masonry_status) else "PENDING",
                 "checked_by": "Karthik Reddy" if (i < len(masonry_status) and masonry_status[i] != "PENDING") else None,
                 "checked_at": now if (i < len(masonry_status) and masonry_status[i] != "PENDING") else None,
                 "remarks": "Lintel rework needed" if (i < len(masonry_status) and masonry_status[i] == "FAIL") else None}
                for i, t in enumerate(tpls.get("Masonry", []))
            ],
            "signed_off": False, "signed_off_by": None, "signed_off_at": None,
            "created_at": now,
        })
        await db.stage_checklists.insert_many(cl_docs)
        log.info("Seed v2: %d stage checklists.", len(cl_docs))


async def seed_crm():
    """Seed CRM pricing + demo leads if empty."""
    now = datetime.now(timezone.utc).isoformat()

    if await db.pricing.count_documents({}) == 0:
        pricing_docs = [
            {
                "id": str(uuid.uuid4()), "elevation_type": "Elora",
                "base_price_inr": 12750000.0,
                "base_price_per_sqft_inr": 8500.0,
                "premium_pct": 5.0,
                "premium_zones": [
                    {"plot_range_start": 100, "plot_range_end": 110, "premium_pct": 5.0},
                ],
                "valid_from": "2026-01-01", "valid_until": None, "status": "ACTIVE",
            },
            {
                "id": str(uuid.uuid4()), "elevation_type": "Selora",
                "base_price_inr": 13800000.0,
                "base_price_per_sqft_inr": 9200.0,
                "premium_pct": 0.0,
                "premium_zones": [],
                "valid_from": "2026-01-01", "valid_until": None, "status": "ACTIVE",
            },
            {
                "id": str(uuid.uuid4()), "elevation_type": "Avira",
                "base_price_inr": 11700000.0,
                "base_price_per_sqft_inr": 7800.0,
                "premium_pct": 3.0,
                "premium_zones": [
                    {"plot_range_start": 1, "plot_range_end": 20, "premium_pct": 3.0},
                ],
                "valid_from": "2026-01-01", "valid_until": None, "status": "ACTIVE",
            },
            {
                "id": str(uuid.uuid4()), "elevation_type": "Riora",
                "base_price_inr": 10800000.0,
                "base_price_per_sqft_inr": 7200.0,
                "premium_pct": 0.0,
                "premium_zones": [],
                "valid_from": "2026-01-01", "valid_until": None, "status": "ACTIVE",
            },
        ]
        await db.pricing.insert_many([{**d, "_id": d["id"]} for d in pricing_docs])
        log.info("Seed CRM: %d pricing entries.", len(pricing_docs))

    if await db.leads.count_documents({}) == 0:
        admin_doc = await db.users.find_one({"role": "ADMIN"}, {"_id": 0, "id": 1})
        admin_id = admin_doc["id"] if admin_doc else "system"
        lead_defs = [
            ("Rajesh Sharma", "+91 98765 43210", "WALK_IN", "Elora", "₹3.5-4.5 Cr", "SITE_VISIT_DONE"),
            ("Priya Kapoor", "+91 87654 32109", "REFERRAL", "Selora", "₹4-5 Cr", "NEGOTIATION"),
            ("Amit Patel", "+91 76543 21098", "WEBSITE", "Avira", "₹3-3.5 Cr", "NEW"),
            ("Deepa Nair", "+91 65432 10987", "AD", "Riora", "₹2.5-3 Cr", "CONTACTED"),
            ("Suresh Reddy", "+91 54321 09876", "BROKER", "Elora", "₹4-5 Cr", "SITE_VISIT_SCHEDULED"),
        ]
        lead_docs = []
        for name, phone, source, elev, budget, status_v in lead_defs:
            lead_docs.append({
                "id": str(uuid.uuid4()), "full_name": name, "phone": phone,
                "email": None, "source": source, "interested_elevation": elev,
                "budget_range_inr": budget, "status": status_v,
                "assigned_to": admin_id, "notes": f"Demo lead — {source}",
                "created_at": now, "updated_at": now,
            })
        await db.leads.insert_many([{**d, "_id": d["id"]} for d in lead_docs])
        log.info("Seed CRM: %d demo leads.", len(lead_docs))


DATA_URI_RE = re.compile(r"^data:(.+?);base64,(.+)$", re.DOTALL)

# ---- v3: Layout plan plots (251 villas, 4 elevation models) ----
# Default elevation mapping derived from dimension clusters on the layout PDF
# (9.14x15.24m = 30x50 for 218-251; 12.19x15.24m = 40x50 around 100-150).
# Replace with the client's final plot->elevation list when provided.
ELEVATION_DIMENSIONS = {
    "Elora": "40 x 50",
    "Selora": "35 x 55",
    "Avira": "35 x 50",
    "Riora": "30 x 50",
}


def _villa_type_for_plot(n: int) -> str:
    if 218 <= n <= 251:
        return "Riora"
    if 100 <= n <= 150:
        return "Elora"
    if 151 <= n <= 217:
        return "Selora" if n % 5 == 0 else "Avira"
    # plots 1-99: balanced mix
    return ["Avira", "Elora", "Selora", "Avira"][n % 4]


PLOT_PROJECT_LINKS = {
    12: "villa-aurelia-12",
    8: "villa-celeste-08",
    5: "villa-meridian-05",
}


async def seed_plots():
    if await db.plots.count_documents({}) > 0:
        return
    docs = []
    for n in range(1, 252):
        vtype = _villa_type_for_plot(n)
        project_id = PLOT_PROJECT_LINKS.get(n)
        if project_id:
            status_v = "UNDER_CONSTRUCTION"
        elif n % 7 in (0, 1):
            status_v = "SOLD"
        else:
            status_v = "AVAILABLE"
        docs.append({
            "id": str(uuid.uuid4()),
            "plot_no": n,
            "villa_type": vtype,
            "dimension_ft": ELEVATION_DIMENSIONS[vtype],
            "status": status_v,
            "project_id": project_id,
        })
    await db.plots.insert_many(docs)
    log.info("Seed v3: %d layout plots.", len(docs))


async def _store_data_uri(data_uri: str, name: str):
    m = DATA_URI_RE.match(data_uri)
    if not m:
        return None
    mime, b64 = m.groups()
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return None
    fid = await fs_bucket.upload_from_stream(name, raw, metadata={"content_type": mime, "migrated": True})
    return f"/api/files/{fid}"


async def migrate_base64_to_gridfs():
    """One-way idempotent migration of base64 payloads into GridFS streaming URLs."""
    migrated = 0

    # documents.file_data → file_url
    async for d in db.documents.find({"file_data": {"$regex": "^data:"}}):
        url = await _store_data_uri(d["file_data"], d.get("file_name", "document"))
        if url:
            await db.documents.update_one(
                {"id": d["id"]},
                {"$set": {"file_url": url}, "$unset": {"file_data": ""}},
            )
            migrated += 1

    # reports.photos / snags.photos inline base64 → /api/files URLs
    for coll in ("reports", "snags"):
        async for r in db[coll].find({"photos": {"$elemMatch": {"$regex": "^data:"}}}):
            new_photos = []
            for p in r.get("photos", []):
                if isinstance(p, str) and p.startswith("data:"):
                    url = await _store_data_uri(p, "site-photo.jpg")
                    new_photos.append(url or p)
                    migrated += 1
                else:
                    new_photos.append(p)
            await db[coll].update_one({"id": r["id"]}, {"$set": {"photos": new_photos}})

    if migrated:
        log.info("GridFS migration: converted %d base64 payloads.", migrated)
