"""Shared configuration: env, database client, logging."""
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
        flush=True,
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

# ── Database client ─────────────────────────────────────────────────
# Motor client is safe to create without a running loop in Motor 3.x+
# It only needs the loop when performing actual I/O operations.
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
fs_bucket = AsyncIOMotorGridFSBucket(db)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
