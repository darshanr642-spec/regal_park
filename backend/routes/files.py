"""GridFS-backed file storage: upload + streaming download.

Files are stored in MongoDB GridFS (chunked) and served via streaming URLs
instead of inline base64 payloads.
"""
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from gridfs.errors import NoFile

from auth_utils import get_user_flexible, require_internal
from config import fs_bucket
from models import User

router = APIRouter()

MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("/files")
async def upload_file(file: UploadFile = File(...), user: User = Depends(require_internal)):
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "File too large (max 15 MB)")
    if not data:
        raise HTTPException(400, "Empty file")
    content_type = file.content_type or "application/octet-stream"
    fid = await fs_bucket.upload_from_stream(
        file.filename or "file",
        data,
        metadata={"content_type": content_type, "uploaded_by": user.full_name},
    )
    return {
        "id": str(fid),
        "url": f"/api/files/{fid}",
        "content_type": content_type,
        "size": len(data),
    }


@router.get("/files/{file_id}")
async def get_file(file_id: str, user: User = Depends(get_user_flexible)):
    try:
        oid = ObjectId(file_id)
    except InvalidId:
        raise HTTPException(404, "File not found")
    try:
        grid_out = await fs_bucket.open_download_stream(oid)
    except NoFile:
        raise HTTPException(404, "File not found")

    content_type = (grid_out.metadata or {}).get("content_type", "application/octet-stream")

    async def iterator():
        while True:
            chunk = await grid_out.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(
        iterator(),
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{grid_out.filename or "file"}"',
            "Cache-Control": "private, max-age=86400",
        },
    )
