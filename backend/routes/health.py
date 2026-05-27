# routes/health.py — System health endpoints
# ------------------------------------------
# Updated for v3: returns uppercase branch names to match BRANCH_NAMES.

from datetime import datetime, timezone
from fastapi import APIRouter
import state

router = APIRouter(tags=["Health"])

# Keys that are NOT branch shards — skip from branch health display
_NON_BRANCH_KEYS = {"ledger", "customers"}


@router.get("/", summary="Root ping — confirm the coordinator is alive")
async def root():
    return {"message": "Distributive Banking Coordinator is live.", "version": "3.0.0"}


@router.get("/health", summary="Extended health check — ping each branch node")
async def health():
    """
    DISTRIBUTIVE QUERY: Sends a ping command to every physical branch DB.
    Returns per-branch status so the frontend can show which nodes are reachable.
    Branch names are returned uppercase (NORTH, SOUTH, ...) to match the schema.
    """
    results = {}
    for name, db in state.db_instances.items():
        if name in _NON_BRANCH_KEYS:
            continue  # skip coordinator and customer DBs — not branch shards
        try:
            await db.command("ping")
            results[name.upper()] = "ok"   # uppercase for frontend BRANCH_META alignment
        except Exception as exc:
            results[name.upper()] = f"error: {exc}"

    return {"branches": results, "timestamp": datetime.now(timezone.utc)}
