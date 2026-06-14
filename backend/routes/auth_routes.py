"""Auth routes: login, me, users list."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request

from auth_utils import get_current_user, make_token, require_roles, verify_pw
from config import db
from models import LoginRequest, Token, User

router = APIRouter()


@router.post("/auth/login", response_model=Token)
async def login(request: Request, body: LoginRequest):
    """Login with rate limiting enforced at the app middleware level."""
    doc = await db.users.find_one({"email": body.email.lower()})
    if not doc or not verify_pw(body.password, doc.get("hashed_password", "")):
        raise HTTPException(401, "Invalid email or password")
    if not doc.get("is_active", True):
        raise HTTPException(403, "Account deactivated")
    token = make_token(doc["id"], doc["role"])
    return Token(access_token=token)


@router.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@router.get("/auth/users", response_model=List[User])
async def list_users(user: User = Depends(require_roles({"ADMIN"}))):
    """List all users — restricted to ADMIN only (CRIT-5)."""
    rows = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(200)
    return [User(**r) for r in rows]

