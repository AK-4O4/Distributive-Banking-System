# routes/ledger.py — Coordinator transaction ledger endpoint
# ────────────────────────────────────────────────────────────
# Provides read access to the global_transactions collection in the coordinator
# ledger database. Supports filtering by transaction state and result limiting.

from typing import Optional

from fastapi import APIRouter, Depends, Query

from helpers import serialize_tx
from models import TransactionLogEntry
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/transactions",
    tags=["Ledger"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


@router.get(
    "/",
    response_model=list[TransactionLogEntry],
    summary="Query the global coordinator transaction ledger",
)
async def list_transactions(
    state_filter: Optional[str] = Query(
        None,
        alias="state",
        description="Filter by state: PENDING | PREPARED | COMMITTED | ABORTED | COMMIT_FAILED",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """
    DISTRIBUTIVE QUERY on the coordinator ledger DB.

    QUERY OPTIMIZATION: Results are sorted by created_at DESC (most recent first)
    using the idx_state_created compound index. The state filter leverages idx_state.
    """
    ledger_db = state.db_instances["ledger"]
    query_filter: dict = {}
    if state_filter:
        query_filter["state"] = state_filter.upper()

    txns = []
    async for doc in (
        ledger_db.global_transactions
        .find(query_filter)
        .sort("created_at", -1)
        .limit(limit)
    ):
        txns.append(serialize_tx(doc))

    return txns
