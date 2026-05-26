# routes/transfers.py — Two-Phase Commit (2PC) transfer endpoint
# ───────────────────────────────────────────────────────────────
# Implements the full 2PC protocol for atomic cross-branch fund transfers.
#
# Protocol phases:
#   Phase 0  — Pre-checks:   validate IDs, idempotency check, verify target
#   Phase 1  — PREPARE:      lock funds at source (PENDING → PREPARED)
#   Phase 2a — COMMIT:       debit source locked balance, credit target (PREPARED → COMMITTED)
#   Phase 2b — ABORT:        compensate (unlock) source funds on any failure (→ ABORTED)

import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import TRANSFER_PROJECTION
from helpers import get_branch_db, valid_oid
from models import TransferRequest
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/transfer",
    tags=["2PC Transfer"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


@router.post("/", summary="Execute an atomic cross-branch fund transfer via Two-Phase Commit")
async def process_transfer(req: TransferRequest):
    """
    TWO-PHASE COMMIT PROTOCOL
    ─────────────────────────
    Guarantees atomicity across multiple distributed nodes:

    Phase 0 — Pre-checks
      · Reject self-transfers (source == target account)
      · Idempotency: if this key was already COMMITTED, return the cached result
      · Verify the target account exists and is ACTIVE (fail fast before locking funds)

    Phase 1 — PREPARE  (PENDING → PREPARED)
      · Atomic findAndModify on source: only succeeds if status=ACTIVE AND balance≥amount
      · Deducts from available_balance and adds to locked_balance atomically
      · No negative balance possible (single atomic operation with $gte guard)

    Phase 2a — COMMIT  (PREPARED → COMMITTED)
      · asyncio.gather: debit locked_balance at source + credit available_balance at target
      · Finalize ledger entry as COMMITTED

    Phase 2b — ABORT   (PREPARED → ABORTED)
      · On any exception in Phase 1: compensation write unlocks source funds
      · Ledger entry marked ABORTED with error detail
    """
    ledger_db = state.db_instances["ledger"]
    source_db = get_branch_db(req.source_branch)
    target_db = get_branch_db(req.target_branch)

    # ── CONSISTENCY: reject self-transfer ────────────────────────────────────
    if req.source_account_id == req.target_account_id:
        raise HTTPException(status_code=400, detail="Source and target accounts must differ")

    source_oid = ObjectId(req.source_account_id)  # already validated by Pydantic
    target_oid = ObjectId(req.target_account_id)

    # ── Phase 0: Idempotency check ───────────────────────────────────────────
    if req.idempotency_key:
        existing_tx = await ledger_db.global_transactions.find_one(
            {"idempotency_key": req.idempotency_key, "state": "COMMITTED"},
            {"_id": 1},
        )
        if existing_tx:
            return {
                "message":        "Transfer already committed (idempotent replay).",
                "transaction_id": str(existing_tx["_id"]),
                "idempotent":     True,
            }

    # ── Phase 0: Verify target is ACTIVE before locking any source funds ─────
    target_account = await target_db.accounts.find_one({"_id": target_oid}, TRANSFER_PROJECTION)
    if not target_account:
        raise HTTPException(status_code=404, detail="Target account not found")
    if target_account.get("status") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail=f"Target account is not ACTIVE (status: {target_account.get('status')})",
        )

    # ── Record PENDING entry in coordinator ledger ───────────────────────────
    tx_doc = {
        "type":               "CROSS_BRANCH_TRANSFER",
        "initiator_id":       req.initiator_id,
        "source_branch":      req.source_branch,
        "source_account_id":  req.source_account_id,
        "target_branch":      req.target_branch,
        "target_account_id":  req.target_account_id,
        "amount":             req.amount,
        "state":              "PENDING",
        "idempotency_key":    req.idempotency_key,
        "created_at":         datetime.now(timezone.utc),
    }
    tx_result = await ledger_db.global_transactions.insert_one(tx_doc)
    tx_id = tx_result.inserted_id

    source_update = None  # track whether funds were locked (needed for rollback)

    try:
        # ── Phase 1: PREPARE ─────────────────────────────────────────────────
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "PREPARED", "prepared_at": datetime.now(timezone.utc)}},
        )

        # Atomic lock: only modifies the document if status=ACTIVE AND balance≥amount.
        # A single findAndModify — no separate read + write race condition possible.
        source_update = await source_db.accounts.update_one(
            {
                "_id":               source_oid,
                "status":            "ACTIVE",
                "available_balance": {"$gte": req.amount},
            },
            {"$inc": {
                "available_balance": -req.amount,
                "locked_balance":     req.amount,
            }},
        )

        if source_update.modified_count == 0:
            # Distinguish "not found" vs "insufficient funds" vs "not active"
            source_check = await source_db.accounts.find_one(
                {"_id": source_oid},
                {"status": 1, "available_balance": 1},
            )
            if not source_check:
                raise Exception("Source account not found")
            elif source_check.get("status") != "ACTIVE":
                raise Exception(f"Source account is not ACTIVE (status: {source_check.get('status')})")
            else:
                raise Exception(
                    f"Insufficient funds: available ${source_check.get('available_balance', 0):.2f}, "
                    f"requested ${req.amount:.2f}"
                )

    except Exception as exc:
        # ── Phase 2b: ABORT — compensation + ledger update ───────────────────
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {
                "state":      "ABORTED",
                "error":      str(exc),
                "aborted_at": datetime.now(timezone.utc),
            }},
        )
        # Compensation: if funds were locked, unlock them
        if source_update is not None and source_update.modified_count > 0:
            await source_db.accounts.update_one(
                {"_id": source_oid},
                {"$inc": {"available_balance": req.amount, "locked_balance": -req.amount}},
            )
        raise HTTPException(status_code=400, detail=f"Transfer aborted during PREPARE: {exc}")

    # ── Phase 2a: COMMIT ─────────────────────────────────────────────────────
    # Source funds are locked. Both accounts confirmed ACTIVE. Now finalize atomically.
    try:
        await asyncio.gather(
            # Debit: remove from locked_balance at source (available already decremented)
            source_db.accounts.update_one(
                {"_id": source_oid},
                {"$inc": {"locked_balance": -req.amount}},
            ),
            # Credit: add to available_balance at target
            target_db.accounts.update_one(
                {"_id": target_oid},
                {"$inc": {"available_balance": req.amount}},
            ),
        )
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "COMMITTED", "committed_at": datetime.now(timezone.utc)}},
        )
    except Exception as exc:
        # Commit failure is the hardest case in 2PC — requires manual intervention.
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {
                "state":      "COMMIT_FAILED",
                "error":      str(exc),
                "aborted_at": datetime.now(timezone.utc),
            }},
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"CRITICAL: Commit phase failed. Transaction {tx_id} is in "
                f"COMMIT_FAILED state and requires manual recovery."
            ),
        )

    return {
        "message":        "Transfer completed successfully across distributed nodes.",
        "transaction_id": str(tx_id),
        "phase":          "COMMITTED",
        "amount":         req.amount,
        "source_branch":  req.source_branch,
        "target_branch":  req.target_branch,
    }
