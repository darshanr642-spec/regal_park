"""Shared configuration: env, database client, logging."""
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ.get("JWT_SECRET", "default-dev-secret-that-is-long-enough-for-testing-only")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 1
REFRESH_TOKEN_DAYS = 30

# ── JWT secret length guard (warning only) ───────────────────────────
if len(JWT_SECRET) < 32:
    print(f"WARNING: JWT_SECRET is only {len(JWT_SECRET)} chars.", file=sys.stderr, flush=True)

# ── CORS allowed origins ────────────────────────────────────────────
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
if _raw_origins.strip() == "*" or not _raw_origins.strip():
    ALLOWED_ORIGINS: list[str] = ["*"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Feature flags ───────────────────────────────────────────────────
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"

# ── Redis (optional) ────────────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", None)

# ── Database client ─────────────────────────────────────────────────
# Motor 3.x: AsyncIOMotorClient with connect=False does NOT touch the event
# loop at construction time. It only connects when the first I/O operation
# runs (inside uvicorn's event loop). This is safe to create at module level.
client = AsyncIOMotorClient(MONGO_URL, connect=False)
db = client[DB_NAME]
fs_bucket = AsyncIOMotorGridFSBucket(db)

# ── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
