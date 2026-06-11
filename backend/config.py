"""Shared configuration: env, database client, logging."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "regal_park_villas")
JWT_SECRET = os.environ["JWT_SECRET"]  # required, no fallback
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7  # 7 days

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
fs_bucket = AsyncIOMotorGridFSBucket(db)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("rpv")
