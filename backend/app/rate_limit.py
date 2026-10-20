"""
Request limits.

Without these, one script can hammer sign-ups, flood the escalation queue
or walk the booking endpoints as fast as the network allows. The counters
live in this process's memory, which is enough for KOODAM's single Render
instance; move them to Redis before running more than one worker, or each
worker will allow the full quota on its own.
"""

import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def _limit(name: str, default: str) -> Tuple[int, int]:
    """A "requests/seconds" setting, e.g. KOODAM_RATE_WRITE=60/60."""
    raw = os.getenv(name, default)

    try:
        count, window = raw.split("/")
        return max(int(count), 1), max(int(window), 1)
    except (ValueError, AttributeError):
        count, window = default.split("/")
        return int(count), int(window)


# Anything that creates an account or sends an email: the expensive,
# abusable paths. Deliberately tight.
AUTH_LIMIT = _limit("KOODAM_RATE_AUTH", "10/60")

# Writes: bookings, syncs, complaints, profile edits, payments.
WRITE_LIMIT = _limit("KOODAM_RATE_WRITE", "90/60")

# Reads. The app polls a few of these, so this is generous.
READ_LIMIT = _limit("KOODAM_RATE_READ", "300/60")

# Paths that never count against anyone - uptime pings and the phone
# provider's webhook, which has its own signature check.
EXEMPT_PREFIXES = ("/health", "/ivr/twilio")

# Paths that get the strict allowance regardless of method
AUTH_PREFIXES = ("/users/sync", "/users/", "/client-errors")


def _bucket_for(request: Request) -> Optional[Tuple[str, int, int]]:
    path = request.url.path

    if any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
        return None

    if request.method == "OPTIONS":
        return None

    if request.method == "POST" and path in AUTH_PREFIXES:
        return "auth", *AUTH_LIMIT

    if request.method in ("POST", "PATCH", "PUT", "DELETE"):
        return "write", *WRITE_LIMIT

    return "read", *READ_LIMIT


def client_key(request: Request) -> str:
    """
    Who to count against. The signed-in user if we can tell cheaply,
    otherwise the caller's address. Render and Vercel both sit behind a
    proxy, so the first hop in X-Forwarded-For is the real client.
    """
    auth = request.headers.get("Authorization", "")

    if auth.lower().startswith("bearer "):
        # The token's own tail, not the uid: verifying the signature here
        # would double the crypto work on every single request. Tokens
        # rotate hourly, which is fine for a per-minute window.
        return f"t:{auth[-24:]}"

    forwarded = request.headers.get("X-Forwarded-For", "")

    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"

    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def _sweep(self, now: float) -> None:
        """Drop buckets nobody has touched, so memory can't creep up."""
        if now - self._last_sweep < 300:
            return

        self._last_sweep = now

        for key in list(self._hits):
            if not self._hits[key] or now - self._hits[key][-1] > 3600:
                del self._hits[key]

    def _over_limit(self, key: str, bucket: str, count: int, window: int):
        now = time.monotonic()

        with self._lock:
            self._sweep(now)

            hits = self._hits[(key, bucket)]

            while hits and now - hits[0] >= window:
                hits.popleft()

            if len(hits) >= count:
                return int(window - (now - hits[0])) + 1

            hits.append(now)
            return None

    async def dispatch(self, request: Request, call_next):
        limit = _bucket_for(request)

        if limit is None:
            return await call_next(request)

        bucket, count, window = limit
        retry_after = self._over_limit(client_key(request), bucket, count, window)

        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "You're doing that too quickly. Please wait a "
                        "moment and try again."
                    )
                },
                headers={"Retry-After": str(retry_after)}
            )

        return await call_next(request)
