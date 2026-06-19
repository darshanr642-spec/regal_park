"""Shared configuration: env, database client, logging."""
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_raw_mongo = os.environ.get("MONGO_URL", "mongodb://localhost:27017")

# ── Auto-fix MongoDB password URL-encoding ──────────────────────────
# Atlas passwords with special chars (!, @, #, etc.) must be percent-encoded.
def _fix_mongo_url(url: str) -> str:
    """URL-encode password in mongodb+srv:// URIs if needed."""
    from urllib.parse import quote_plus, urlparse, urlunparse
    try:
        parsed = urlparse(url)
        if parsed.password and any(c in parsed.password for c in "!@#$%^&*()+ "):
            encoded_pw = quote_plus(parsed.password)
            # Rebuild netloc: user:encoded_pw@host
            netloc = f"{parsed.username}:{encoded_pw}@{parsed.hostname}"
            if parsed.port:
                netloc += f":{parsed.port}"
            return urlunparse(parsed._replace(netloc=netloc))
    except Exception:
        pass
    return url

MONGO_URL = _fix_mongo_url(_raw_mongo)
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ.get("JWT_SECRET", "default-dev-secret-that-is-long-enough-for-testing-only")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 1  # 1 hour (CRIT-2: was 7 days)
REFRESH_TOKEN_DAYS = 30  # refresh token lifetime

# ── JWT secret length guard (warning only — don't crash on Render) ───
if len(JWT_SECRET) < 32:
    print(f"WARNING: JWT_SECRET is only {len(JWT_SECRET)} chars. Use ≥32 in production.", file=sys.stderr, flush=True)

# ── CORS allowed origins ────────────────────────────────────────────
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
if _raw_origins.strip() == "*" or not _raw_origins.strip():
    ALLOWED_ORIGINS: list[str] = ["*"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Feature flags ───────────────────────────────────────────────────
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"

# ── Redis (optional — for distributed rate limiting) ────────────────
REDIS_URL = os.environ.get("REDIS_URL", None)

# ── Database client ─────────────────────────────────────────────────
# Motor 3.x: AsyncIOMotorClient with connect=False does NOT touch the event
# loop at construction time. It only connects when the first I/O operation
# runs (inside uvicorn's event loop). This is safe to create at module level.
client = AsyncIOMotorClient(
    MONGO_URL,
    connect=False,
    serverSelectionTimeoutMS=10000,  # 10s timeout for Atlas cold starts
    connectTimeoutMS=10000,
    socketTimeoutMS=30000,
)
db = client[DB_NAME]
fs_bucket = AsyncIOMotorGridFSBucket(db)

# ── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
