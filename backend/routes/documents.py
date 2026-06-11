"""Documents module: paginated list, create (with GridFS file URL), delete."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user, require_internal
from config import db, fs_bucket, log
from models import Document, DocumentCreate, User

router = APIRouter()


@router.get("/documents")
async def list_documents(
    project_id: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 100))
    skip = max(0, skip)
    q = {"project_id": project_id} if project_id else {}
    total = await db.documents.count_documents(q)
    rows = (
        await db.documents.find(q, {"_id": 0})
        .sort("uploaded_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return {
        "items": [Document(**r).dict() for r in rows],
        "total": total,
        "limit": limit,
        "skip": skip,
        "has_more": skip + len(rows) < total,
    }


@router.post("/documents", response_model=Document)
async def create_document(body: DocumentCreate, user: User = Depends(require_internal)):
    doc = Document(
        id=str(uuid.uuid4()),
        uploaded_by=user.full_name,
        uploaded_at=datetime.now(timezone.utc).isoformat(),
        **body.dict(),
    )
    await db.documents.insert_one(doc.dict())
    return doc


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: User = Depends(require_internal)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    # Clean up the GridFS blob if present
    file_url = doc.get("file_url") or ""
    if file_url.startswith("/api/files/"):
        try:
            await fs_bucket.delete(ObjectId(file_url.rsplit("/", 1)[-1]))
        except (InvalidId, Exception) as e:  # noqa: BLE001 — best-effort cleanup
            log.warning("GridFS cleanup skipped for %s: %s", file_url, e)
    await db.documents.delete_one({"id": doc_id})
    return {"ok": True}
