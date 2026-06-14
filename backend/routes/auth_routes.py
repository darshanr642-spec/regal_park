"""Auth routes: login, refresh, logout, me, users list (CRIT-2)."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth_utils import (
    create_refresh_token,
    get_current_user,
    make_token,
    require_roles,
    revoke_all_user_tokens,
    revoke_refresh_token,
    validate_refresh_token,
    verify_pw,
)
from config import db
from models import LoginRequest, Token, User

router = APIRouter()


# ── Login ────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=Token)
async def login(request: Request, body: LoginRequest):
    """Authenticate and return access + refresh tokens."""
    doc = await db.users.find_one({"email": body.email.lower()})
    if not doc or not verify_pw(body.password, doc.get("hashed_password", "")):
        raise HTTPException(401, "Invalid email or password")
    if not doc.get("is_active", True):
        raise HTTPException(403, "Account deactivated")
    access = make_token(doc["id"], doc["role"])
    refresh = await create_refresh_token(doc["id"], doc["role"])
    return Token(access_token=access, refresh_token=refresh)


# ── Refresh ──────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/auth/refresh", response_model=Token)
async def refresh(body: RefreshRequest):
    """Exchange a valid refresh token for new access + refresh tokens.

    The old refresh token is revoked (rotation) to limit replay attacks.
    """
    token_doc = await validate_refresh_token(body.refresh_token)
    user_id = token_doc["user_id"]

    # Verify user still exists and is active
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if not user.get("is_active", True):
        # Revoke all tokens for deactivated user
        await revoke_all_user_tokens(user_id)
        raise HTTPException(403, "Account deactivated")

    # Rotate: revoke old, issue new pair
    await revoke_refresh_token(body.refresh_token)
    new_access = make_token(user_id, user["role"])
    new_refresh = await create_refresh_token(user_id, user["role"])
    return Token(access_token=new_access, refresh_token=new_refresh)


# ── Logout ───────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def logout(body: RefreshRequest):
    """Revoke the refresh token. Access token naturally expires in 1 hour."""
    revoked = await revoke_refresh_token(body.refresh_token)
    return {"revoked": revoked, "message": "Logged out successfully"}


# ── Me ───────────────────────────────────────────────────────────────

@router.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


# ── Users list (ADMIN only — CRIT-5) ────────────────────────────────

@router.get("/auth/users", response_model=List[User])
async def list_users(user: User = Depends(require_roles({"ADMIN"}))):
    """List all users — restricted to ADMIN only."""
    rows = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(200)
    return [User(**r) for r in rows]

