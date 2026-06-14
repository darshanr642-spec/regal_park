"""Shared configuration: env, database client, logging."""
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ["JWT_SECRET"]  # required, no fallback
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
    ALLOWED_ORIGINS: list[str] = []
    print(
        "WARNING: ALLOWED_ORIGINS is empty — CORS will block all cross-origin requests. "
        "Set ALLOWED_ORIGINS in your .env for the frontend to work.",
        file=sys.stderr,
    )
elif _raw_origins.strip() == "*":
    ALLOWED_ORIGINS = ["*"]
    print(
        "WARNING: ALLOWED_ORIGINS is set to '*' (wildcard). "
        "This is acceptable for local dev but MUST be restricted in production.",
        file=sys.stderr,
    )
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Feature flags ───────────────────────────────────────────────────
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"

# ── Redis (optional — for distributed rate limiting) ────────────────
REDIS_URL = os.environ.get("REDIS_URL", None)  # type: Optional[str]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
fs_bucket = AsyncIOMotorGridFSBucket(db)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
