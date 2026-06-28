"""Shared configuration: env, database client, logging."""
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_raw_mongo = os.environ.get("MONGO_URL", "mongodb://localhost:27017")

# ── Auto-migrate deleted Cluster0 → new SRP cluster ────────────────
# The old Atlas cluster (cluster0.bsx0gqz) was deleted. This ensures the
# correct SRP cluster URL is used regardless of stale env vars on Render.
if "cluster0.bsx0gqz" in _raw_mongo:
    _raw_mongo = "mongodb+srv://rpv_admin:rpv_admin@srp.q95pvjg.mongodb.net/regal_park_villas?retryWrites=true&w=majority&appName=SRP"
    print("INFO: Auto-migrated MONGO_URL from deleted Cluster0 to SRP cluster.", flush=True)

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

# ── Database client (lazy — created inside uvicorn's event loop) ────
# Motor 3.x on Python 3.11+ can capture the wrong event loop if the client
# is created at module-import time. These proxies defer creation until the
# first actual DB call, which runs inside uvicorn's event loop.

_client = None

def _get_client():
    global _client
    if _client is None:
        from motor.motor_asyncio import AsyncIOMotorClient
        _client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
            socketTimeoutMS=30000,
        )
    return _client


class _DBProxy:
    """Thin proxy that lazily creates the Motor client on first attribute access."""
    _db = None

    def _ensure(self):
        if self._db is None:
            self._db = _get_client()[DB_NAME]

    def __getattr__(self, name):
        self._ensure()
        return getattr(self._db, name)

    def __getitem__(self, name):
        self._ensure()
        return self._db[name]


class _FSProxy:
    """Thin proxy for GridFS bucket — lazily created."""
    _bucket = None

    def _ensure(self):
        if self._bucket is None:
            from motor.motor_asyncio import AsyncIOMotorGridFSBucket
            self._bucket = AsyncIOMotorGridFSBucket(_get_client()[DB_NAME])

    def __getattr__(self, name):
        self._ensure()
        return getattr(self._bucket, name)


# These are imported throughout the codebase as `from config import db, fs_bucket`
client = None  # set during startup for clean shutdown
db = _DBProxy()
fs_bucket = _FSProxy()

# ── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
