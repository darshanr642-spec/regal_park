"""Layout plan plots: 251 villa plots with elevation types and construction phases.

Elevation models:
  Elora 40x50 · Selora 35x55 · Avira 35x50 · Riora 30x50
NOTE: per-plot elevation mapping is a sensible DEFAULT (derived from dimension
clusters annotated on the layout PDF) until the client supplies the final list.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user
from config import db
from models import Plot, User

router = APIRouter()

ELEVATIONS = {
    "Elora": "40 x 50",
    "Selora": "35 x 55",
    "Avira": "35 x 50",
    "Riora": "30 x 50",
}


@router.get("/plots", response_model=List[Plot])
async def list_plots(user: User = Depends(get_current_user)):
    rows = await db.plots.find({}, {"_id": 0}).sort("plot_no", 1).to_list(300)
    return [Plot(**r) for r in rows]


@router.get("/plots/{plot_no}")
async def get_plot(plot_no: int, user: User = Depends(get_current_user)):
    doc = await db.plots.find_one({"plot_no": plot_no}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Plot not found")
    plot = Plot(**doc)

    project = None
    phases: list = []
    if plot.project_id:
        project = await db.projects.find_one(
            {"id": plot.project_id},
            {"_id": 0, "id": 1, "name": 1, "progress_pct": 1, "status": 1, "villa_type": 1, "target_handover_date": 1},
        )
        stages = await db.stages.find(
            {"project_id": plot.project_id},
            {"_id": 0, "order": 1, "name": 1, "status": 1, "progress_pct": 1, "planned_start": 1, "planned_end": 1},
        ).to_list(100)
        phases = sorted(stages, key=lambda s: s["order"])
    else:
        from seed import STAGE_DEFS  # phase template names
        phases = [
            {"order": i, "name": name, "status": "NOT_STARTED", "progress_pct": 0.0,
             "planned_start": None, "planned_end": None}
            for i, (name, *_rest) in enumerate(STAGE_DEFS, start=1)
        ]

    return {"plot": plot.dict(), "project": project, "phases": phases}
