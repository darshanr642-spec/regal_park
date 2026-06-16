"""Shared configuration: env, database client, logging."""
import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 1  # 1 hour (CRIT-2: was 7 days)
REFRESH_TOKEN_DAYS = 30  # refresh token lifetime

# ── JWT secret length guard ──────────────────────────────────────────
if len(JWT_SECRET) < 32:
    print(
        "FATAL: JWT_SECRET must be at least 32 characters. "
        f"Current length: {len(JWT_SECRET)}. "
        "Set a strong secret in backend/.env",
        file=sys.stderr,
    )
    sys.exit(1)

# ── CORS allowed origins ────────────────────────────────────────────
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
if not _raw_origins.strip():
    ALLOWED_ORIGINS: list[str] = ["*"]
elif _raw_origins.strip() == "*":
    ALLOWED_ORIGINS = ["*"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Feature flags ───────────────────────────────────────────────────
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"

# ── Redis (optional — for distributed rate limiting) ────────────────
REDIS_URL = os.environ.get("REDIS_URL", None)

# ── Database (lazy init — compatible with any Python entry point) ───
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

_client = None
_db = None
_fs_bucket = None

def _ensure_loop():
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())

def get_client():
    global _client
    if _client is None:
        _ensure_loop()
        _client = AsyncIOMotorClient(MONGO_URL)
    return _client

def get_db():
    global _db
    if _db is None:
        _db = get_client()[DB_NAME]
    return _db

def get_fs_bucket():
    global _fs_bucket
    if _fs_bucket is None:
        _fs_bucket = AsyncIOMotorGridFSBucket(get_db())
    return _fs_bucket

# Backward-compatible module-level attributes via __getattr__
def __getattr__(name):
    if name == "client":
        return get_client()
    elif name == "db":
        return get_db()
    elif name == "fs_bucket":
        return get_fs_bucket()
    raise AttributeError(f"module 'config' has no attribute {name!r}")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
