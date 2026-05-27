# routes/ledger.py — Coordinator transaction ledger endpoint
# -----------------------------------------------------------
# Updated for v2 schema: queries "transaction_logs" collection.

from typing import Optional
from fastapi import APIRouter, Depends, Query

from helpers import serialize_tx
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/transactions",
    tags=["Ledger"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)

TX_PROJECTION = {
    "_id": 1,
    "type": 1,
    "initiator_id": 1,
    "source_branch": 1,
    "source_account_id": 1,
    "target_branch": 1,
    "target_account_id": 1,
    "amount": 1,
    "state": 1,
    "idempotency_key": 1,
    "error": 1,
    "created_at": 1,
    "updated_at": 1,
}


@router.get("/", summary="List transactions from the coordinator ledger")
async def list_transactions(
    state_filter: Optional[str] = Query(
        None,
        alias="state",
        description="Filter by state: INITIATED | PREPARED | COMMITTED | ABORTED",
    ),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Returns transactions from db_coordinator_ledger.transaction_logs.
    Ordered newest-first (idx_created_at index).
    """
    ledger_db = state.db_instances["ledger"]
    query: dict = {}
    if state_filter:
        query["state"] = state_filter.upper()

    txns = []
    async for doc in (
        ledger_db.transaction_logs
        .find(query, TX_PROJECTION)
        .sort("created_at", -1)
        .limit(limit)
    ):
        txns.append(serialize_tx(doc))
    return txns
