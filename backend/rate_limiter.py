"""Distributed rate limiting with Redis backend and in-memory fallback.

Uses a sliding-window algorithm (Redis sorted sets / in-memory list).
When REDIS_URL is set, rate limits are shared across all backend instances.
When Redis is unavailable, falls back to process-local in-memory buckets.

Tiers:
  login  —  5 requests / 60s  (per IP)
  write  — 30 requests / 60s  (per IP)
  read   — 120 requests / 60s (per IP)
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Optional

from config import log

# ── Configuration ────────────────────────────────────────────────────

RATE_LIMITS: dict[str, tuple[int, int]] = {
    "login": (5, 60),     # 5 requests per 60 seconds
    "write": (30, 60),    # 30 requests per 60 seconds
    "read":  (120, 60),   # 120 requests per 60 seconds
}


class RateLimiter:
    """Dual-mode rate limiter: Redis-backed or in-memory fallback."""

    def __init__(self, redis_url: Optional[str] = None):
        self._redis = None
        self._redis_url = redis_url
        self._fallback: dict[str, list[float]] = defaultdict(list)
        self._redis_available = False

    async def connect(self) -> None:
        """Attempt Redis connection. Logs warning and falls back on failure."""
        if not self._redis_url:
            log.info("rate_limiter | No REDIS_URL — using in-memory rate limiting.")
            return

        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=2,
            )
            await self._redis.ping()
            self._redis_available = True
            log.info("rate_limiter | Redis connected — distributed rate limiting active.")
        except Exception as exc:
            log.warning(
                "rate_limiter | Redis unavailable (%s) — falling back to in-memory.",
                exc,
            )
            self._redis = None
            self._redis_available = False

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.aclose()

    async def check(self, key: str, tier: str) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        max_requests, window = RATE_LIMITS[tier]

        if self._redis_available and self._redis:
            return await self._check_redis(key, tier, max_requests, window)
        return self._check_memory(key, tier, max_requests, window)

    # ── Redis implementation (sliding window via sorted set) ─────────

    async def _check_redis(
        self, key: str, tier: str, max_req: int, window: int
    ) -> bool:
        """Sliding window counter using Redis sorted sets."""
        try:
            bucket_key = f"ratelimit:{tier}:{key}"
            now = time.time()
            cutoff = now - window

            pipe = self._redis.pipeline()
            pipe.zremrangebyscore(bucket_key, "-inf", cutoff)  # evict expired
            pipe.zcard(bucket_key)                              # count current
            pipe.zadd(bucket_key, {str(now): now})              # add this request
            pipe.expire(bucket_key, window + 5)                 # auto-cleanup
            results = await pipe.execute()

            current_count = results[1]
            if current_count >= max_req:
                # Over limit — remove the entry we just added
                await self._redis.zrem(bucket_key, str(now))
                return False
            return True

        except Exception as exc:
            # Redis failure — degrade to in-memory
            log.warning("rate_limiter | Redis error, falling back: %s", exc)
            self._redis_available = False
            return self._check_memory(key, tier, max_req, window)

    # ── In-memory fallback ───────────────────────────────────────────

    def _check_memory(
        self, key: str, tier: str, max_req: int, window: int
    ) -> bool:
        """Process-local sliding window using a list of timestamps."""
        bucket_key = f"{tier}:{key}"
        now = time.time()
        bucket = self._fallback[bucket_key]
        # Evict expired entries
        self._fallback[bucket_key] = [t for t in bucket if now - t < window]
        bucket = self._fallback[bucket_key]
        if len(bucket) >= max_req:
            return False
        bucket.append(now)
        return True
