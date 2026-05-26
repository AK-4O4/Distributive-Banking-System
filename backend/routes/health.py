# routes/health.py — System health endpoints
# ──────────────────────────────────────────
# Provides a root ping and a detailed per-branch connectivity check.
# Used by the frontend to show the "Branch Network" live status panel.

from datetime import datetime, timezone
from fastapi import APIRouter
import state

router = APIRouter(tags=["Health"])


@router.get("/", summary="Root ping — confirm the coordinator is alive")
async def root():
    return {"message": "Distributive Banking Coordinator is live.", "version": "2.0.0"}


@router.get("/health", summary="Extended health check — ping each branch node")
async def health():
    """
    DISTRIBUTIVE QUERY: Sends a ping command to every physical branch DB.
    Returns per-branch status so the frontend can show which nodes are reachable.
    """
    results = {}
    for name, db in state.db_instances.items():
        if name == "ledger":
            continue  # ledger is the coordinator DB, not a branch
        try:
            await db.command("ping")
            results[name] = "ok"
        except Exception as exc:
            results[name] = f"error: {exc}"

    return {"branches": results, "timestamp": datetime.now(timezone.utc)}
