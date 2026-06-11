"""Auth utilities: password hashing, JWT, dependencies and RBAC role groups."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer

from config import JWT_ALG, JWT_EXP_HOURS, JWT_SECRET, db
from models import ROLES, User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


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
INTERNAL_ROLES = set(ROLES) - {"CLIENT"}
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
