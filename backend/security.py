# security.py — API Key authentication & request validation
import os
import time
import hashlib
from collections import defaultdict
from fastapi import Request, HTTPException, Security
from fastapi.security import APIKeyHeader

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# In production: store hashed keys in DB. For this project, env var is fine.
def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()

def get_valid_key_hash() -> str:
    raw = os.getenv("API_KEY", "dev-secret-key-change-in-production")
    return _hash(raw)

async def require_api_key(api_key: str = Security(api_key_header)):
    """Dependency — rejects requests without a valid API key."""
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    if _hash(api_key) != get_valid_key_hash():
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key


# ─── In-memory rate limiter (per IP, per minute) ────────────────────────────
# For production use Redis. This is sufficient for a DBMS course project.

_rate_buckets: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 60       # max requests
RATE_WINDOW = 60.0    # per 60 seconds

async def rate_limit(request: Request):
    """Dependency — simple sliding-window rate limiter."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    bucket = _rate_buckets[client_ip]

    # Evict old timestamps outside the window
    _rate_buckets[client_ip] = [t for t in bucket if now - t < RATE_WINDOW]
    bucket = _rate_buckets[client_ip]

    if len(bucket) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {RATE_LIMIT} requests per {int(RATE_WINDOW)}s",
            headers={"Retry-After": str(int(RATE_WINDOW))},
        )

    bucket.append(now)
