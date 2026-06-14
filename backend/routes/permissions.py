"""Role-Based Permission System — matrix storage, enforcement, and admin management.

The `role_permissions` collection stores one document per role with a map of
module → {view, edit, create, delete} booleans. ADMIN can modify the matrix
at runtime via PATCH /permissions/{role}.

Every mutation in admin.py calls require_permission(module, action) which
looks up the calling user's role in the matrix.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user, require_roles
from config import db
from models import ROLES, User

router = APIRouter(prefix="/permissions", tags=["permissions"])

ADMIN_ONLY = require_roles({"ADMIN"})

# ── Module list ──────────────────────────────────────────────────────
MODULES = [
    "users", "projects", "plots", "boq", "procurement",
    "team", "pricing", "settings", "audit", "leads",
    "bookings", "profile",
]

ACTIONS = ["view", "edit", "create", "delete"]


# ── Default permission matrix ────────────────────────────────────────

def _all():
    return {"view": True, "edit": True, "create": True, "delete": True}

def _ve():
    return {"view": True, "edit": True, "create": False, "delete": False}

def _vec():
    return {"view": True, "edit": True, "create": True, "delete": False}

def _v():
    return {"view": True, "edit": False, "create": False, "delete": False}

def _none():
    return {"view": False, "edit": False, "create": False, "delete": False}


DEFAULT_MATRIX: Dict[str, Dict[str, Dict[str, bool]]] = {
    "ADMIN": {m: _all() for m in MODULES},
    "COO": {
        "users": _v(), "projects": _ve(), "plots": _v(), "boq": _ve(),
        "procurement": _ve(), "team": _ve(), "pricing": _v(),
        "settings": _none(), "audit": _v(), "leads": _v(),
        "bookings": _v(), "profile": _ve(),
    },
    "PROJECT_DIRECTOR": {
        "users": _v(), "projects": _vec(), "plots": _v(), "boq": _vec(),
        "procurement": _ve(), "team": _vec(), "pricing": _v(),
        "settings": _none(), "audit": _none(), "leads": _v(),
        "bookings": _v(), "profile": _ve(),
    },
    "SALES_MANAGER": {
        "users": _v(), "projects": _v(), "plots": _ve(), "boq": _v(),
        "procurement": _v(), "team": _v(), "pricing": _v(),
        "settings": _none(), "audit": _none(), "leads": _vec(),
        "bookings": _vec(), "profile": _ve(),
    },
    "CRM_SALES": {
        "users": _none(), "projects": _none(), "plots": _v(), "boq": _none(),
        "procurement": _none(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _vec(),
        "bookings": _v(), "profile": _ve(),
    },
    "PROJECT_MANAGER": {
        "users": _v(), "projects": _ve(), "plots": _v(), "boq": _vec(),
        "procurement": _ve(), "team": _ve(), "pricing": _v(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
    "SITE_ENGINEER": {
        "users": _none(), "projects": _ve(), "plots": _none(), "boq": _v(),
        "procurement": _v(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
    "PROCUREMENT_MANAGER": {
        "users": _none(), "projects": _v(), "plots": _none(), "boq": _v(),
        "procurement": _vec(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
    "CONTRACTOR": {
        "users": _none(), "projects": _v(), "plots": _none(), "boq": _none(),
        "procurement": _none(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
    "CLIENT": {
        "users": _none(), "projects": _v(), "plots": _none(), "boq": _none(),
        "procurement": _none(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
    "LANDOWNER": {
        "users": _none(), "projects": _v(), "plots": _v(), "boq": _none(),
        "procurement": _none(), "team": _none(), "pricing": _none(),
        "settings": _none(), "audit": _none(), "leads": _none(),
        "bookings": _none(), "profile": _ve(),
    },
}

# Fill remaining roles with a sensible internal default (view projects + edit profile)
for _role in ROLES:
    if _role not in DEFAULT_MATRIX:
        DEFAULT_MATRIX[_role] = {
            "users": _none(), "projects": _v(), "plots": _none(), "boq": _none(),
            "procurement": _none(), "team": _none(), "pricing": _none(),
            "settings": _none(), "audit": _none(), "leads": _none(),
            "bookings": _none(), "profile": _ve(),
        }


# ── Permission enforcement helper ───────────────────────────────────

async def _get_role_permissions(role: str) -> Dict[str, Dict[str, bool]]:
    """Fetch permissions for a role, falling back to defaults if not in DB."""
    doc = await db.role_permissions.find_one({"role": role}, {"_id": 0})
    if doc and "permissions" in doc:
        return doc["permissions"]
    # Return default (and seed it for next time)
    default = DEFAULT_MATRIX.get(role, DEFAULT_MATRIX.get("CONTRACTOR", {}))
    await db.role_permissions.update_one(
        {"role": role},
        {"$set": {"role": role, "permissions": default}},
        upsert=True,
    )
    return default


async def check_permission(user: User, module: str, action: str) -> bool:
    """Return True if user's role has the given permission."""
    # ADMIN always has full access (safety net)
    if user.role == "ADMIN":
        return True
    perms = await _get_role_permissions(user.role)
    mod_perms = perms.get(module, {})
    return mod_perms.get(action, False)


def require_permission(module: str, action: str):
    """FastAPI dependency that enforces a specific permission."""
    async def _dep(user: User = Depends(get_current_user)) -> User:
        allowed = await check_permission(user, module, action)
        if not allowed:
            raise HTTPException(
                403,
                f"Your role ({user.role}) does not have '{action}' permission on '{module}'"
            )
        return user
    return _dep


# ── Seed defaults on startup ────────────────────────────────────────

async def seed_default_permissions():
    """Insert default permission matrix if collection is empty."""
    count = await db.role_permissions.count_documents({})
    if count == 0:
        docs = [{"role": role, "permissions": perms} for role, perms in DEFAULT_MATRIX.items()]
        if docs:
            await db.role_permissions.insert_many(docs)


# ── API Endpoints ────────────────────────────────────────────────────

@router.get("/me")
async def my_permissions(user: User = Depends(get_current_user)):
    """Get current user's permission map."""
    perms = await _get_role_permissions(user.role)
    return {"role": user.role, "permissions": perms}


@router.get("/matrix")
async def permission_matrix(user: User = Depends(ADMIN_ONLY)):
    """Full permission matrix for all roles."""
    docs = await db.role_permissions.find({}, {"_id": 0}).to_list(100)
    # Ensure all roles are represented
    existing_roles = {d["role"] for d in docs}
    for role in ROLES:
        if role not in existing_roles:
            default = DEFAULT_MATRIX.get(role, DEFAULT_MATRIX.get("CONTRACTOR", {}))
            docs.append({"role": role, "permissions": default})
    return {"modules": MODULES, "actions": ACTIONS, "roles": docs}


class PermissionPatch(BaseModel):
    permissions: Dict[str, Dict[str, bool]]


@router.patch("/{role}")
async def patch_role_permissions(role: str, body: PermissionPatch, user: User = Depends(ADMIN_ONLY)):
    """Update a specific role's permissions."""
    if role not in ROLES:
        raise HTTPException(400, f"Invalid role: {role}")
    if role == "ADMIN":
        raise HTTPException(400, "Cannot modify ADMIN permissions — ADMIN always has full access")

    # Validate structure
    for mod, acts in body.permissions.items():
        if mod not in MODULES:
            raise HTTPException(400, f"Unknown module: {mod}")
        for act in acts:
            if act not in ACTIONS:
                raise HTTPException(400, f"Unknown action: {act}")

    await db.role_permissions.update_one(
        {"role": role},
        {"$set": {"role": role, "permissions": body.permissions}},
        upsert=True,
    )
    # Audit
    from routes.admin import _audit
    await _audit(user, "permissions", "update", role, {"permissions": "updated"})
    return {"ok": True, "role": role}


@router.post("/reset")
async def reset_permissions(user: User = Depends(ADMIN_ONLY)):
    """Reset all role permissions to factory defaults."""
    await db.role_permissions.delete_many({})
    docs = [{"role": role, "permissions": perms} for role, perms in DEFAULT_MATRIX.items()]
    await db.role_permissions.insert_many(docs)
    from routes.admin import _audit
    await _audit(user, "permissions", "reset", "all", {"action": "reset_to_defaults"})
    return {"ok": True, "message": "All permissions reset to defaults"}
