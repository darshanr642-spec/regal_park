"""Auth utilities: password hashing, JWT, refresh tokens, dependencies and RBAC role groups."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

# pyrefly: ignore [missing-import]
import bcrypt
# pyrefly: ignore [missing-import]
import jwt as pyjwt
# pyrefly: ignore [missing-import]
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer

from config import JWT_ALG, JWT_EXP_HOURS, JWT_SECRET, REFRESH_TOKEN_DAYS, db
from models import ROLES, User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Refresh token management (CRIT-2) ──────────────────────────────

async def create_refresh_token(user_id: str, role: str) -> str:
    """Create an opaque refresh token stored server-side. Returns the token string."""
    token = secrets.token_urlsafe(48)
    doc = {
        "_id": str(uuid.uuid4()),
        "token": token,
        "user_id": user_id,
        "role": role,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
        "revoked": False,
    }
    await db.refresh_tokens.insert_one(doc)
    return token


async def validate_refresh_token(token: str) -> dict:
    """Validate a refresh token. Returns the token doc or raises 401."""
    doc = await db.refresh_tokens.find_one({"token": token, "revoked": False})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked refresh token")
    # MongoDB stores naive datetimes (UTC assumed); compare with naive UTC
    now_utc = datetime.utcnow()
    if doc["expires_at"] < now_utc:
        # Mark expired token as revoked for cleanup
        await db.refresh_tokens.update_one({"_id": doc["_id"]}, {"$set": {"revoked": True}})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    return doc


async def revoke_refresh_token(token: str) -> bool:
    """Revoke a single refresh token. Returns True if found and revoked."""
    result = await db.refresh_tokens.update_one(
        {"token": token, "revoked": False},
        {"$set": {"revoked": True}},
    )
    return result.modified_count > 0


async def revoke_all_user_tokens(user_id: str) -> int:
    """Revoke all refresh tokens for a user (forced logout everywhere)."""
    result = await db.refresh_tokens.update_many(
        {"user_id": user_id, "revoked": False},
        {"$set": {"revoked": True}},
    )
    return result.modified_count


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def _user_from_token(token: str) -> User:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except pyjwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not doc.get("is_active", True):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account deactivated")
    return User(**doc)


async def get_current_user(token: Optional[str] = Depends(oauth2)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return await _user_from_token(token)


async def get_user_flexible(
    token: Optional[str] = Query(None),
    bearer: Optional[str] = Depends(oauth2),
) -> User:
    """Accepts Authorization header OR ?token= query param (for media/file URLs)."""
    tok = bearer or token
    if not tok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return await _user_from_token(tok)


# RBAC role groups (server-side enforcement; UI-level visibility on top)
INTERNAL_ROLES = set(ROLES) - {"CLIENT", "LANDOWNER"}
FINANCE_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "QUANTITY_SURVEYOR", "ACCOUNTANT"}
WRITE_STAGE_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "SITE_ENGINEER", "PLANNING_ENGINEER"}
WRITE_QUALITY_ROLES = {"ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "QUANTITY_SURVEYOR", "SAFETY_OFFICER"}

# Purchase order lifecycle roles
PO_REQUEST_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "SITE_ENGINEER", "PROCUREMENT_MANAGER"}
PO_APPROVE_ROLES = {"ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER"}
PO_ORDER_ROLES = {"ADMIN", "PROCUREMENT_MANAGER"}
PO_DELIVER_ROLES = {"ADMIN", "PROCUREMENT_MANAGER", "SITE_ENGINEER", "STORE_KEEPER"}
PO_CANCEL_ROLES = {"ADMIN", "PROJECT_DIRECTOR"}

# Checklist sign-off
CHECKLIST_SIGNOFF_ROLES = {"ADMIN", "PROJECT_MANAGER", "QUANTITY_SURVEYOR"}


def require_roles(allowed: set):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role permissions")
        return user
    return _dep


require_internal = require_roles(INTERNAL_ROLES)
require_finance = require_roles(FINANCE_ROLES)

# CRM role groups
CRM_ROLES = {"ADMIN", "CRM_SALES", "SALES_MANAGER", "PROJECT_DIRECTOR"}
SALES_MGMT_ROLES = {"ADMIN", "SALES_MANAGER", "PROJECT_DIRECTOR"}
CRM_READ_ROLES = CRM_ROLES | {"COO"}

