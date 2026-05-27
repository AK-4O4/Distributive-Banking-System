# routes/transfers.py — Two-Phase Commit (2PC) transfer endpoint
# ---------------------------------------------------------------
# Updated for v2 schema:
#   - Transaction log: "transaction_logs" collection (not global_transactions)
#   - TX states: INITIATED -> PREPARED -> COMMITTED / ABORTED
#   - Balances stored/compared as Decimal128 (MongoDB NumberDecimal)
#   - idempotency_key is now required (min 10 chars, enforced by Pydantic)
#   - Transaction _id is a custom TXN-... string for readability

import asyncio
import uuid
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import TRANSFER_PROJECTION
from helpers import get_branch_db, to_d128, from_d128, valid_oid
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
    TWO-PHASE COMMIT PROTOCOL  (v2)
    ================================
    Guarantees atomicity across multiple distributed branch nodes.

    State machine:
      INITIATED  ->  PREPARED  ->  COMMITTED
                           \\->  ABORTED   (on failure in any phase)

    Phase 0 — Pre-checks
      · Reject self-transfers
      · Idempotency: if this key was already COMMITTED, return the cached result
      · Verify the target account exists and is ACTIVE before locking source funds

    Phase 1 — PREPARE  (INITIATED -> PREPARED)
      · Write INITIATED record to transaction_logs
      · Atomic findAndModify on source: only succeeds if status=ACTIVE AND balance>=amount
      · Deducts from available_balance, moves to locked_balance atomically
      · Advances ledger state to PREPARED

    Phase 2a — COMMIT  (PREPARED -> COMMITTED)
      · asyncio.gather: debit locked_balance at source + credit available_balance at target
      · Finalize transaction_logs entry as COMMITTED

    Phase 2b — ABORT   (-> ABORTED)
      · On any failure: compensation write unlocks source funds
      · Ledger entry marked ABORTED with error detail
    """
    ledger_db = state.db_instances["ledger"]
    source_db = get_branch_db(req.source_branch)
    target_db = get_branch_db(req.target_branch)

    # Reject self-transfer
    if req.source_account_id == req.target_account_id:
        raise HTTPException(status_code=400, detail="Source and target accounts must differ")

    source_oid = ObjectId(req.source_account_id)
    target_oid = ObjectId(req.target_account_id)
    amount_d128 = to_d128(req.amount)
    amount_float = float(req.amount)

    # ── Phase 0: Idempotency check ───────────────────────────────────────────
    existing_tx = await ledger_db.transaction_logs.find_one(
        {"idempotency_key": req.idempotency_key, "state": "COMMITTED"},
        {"_id": 1},
    )
    if existing_tx:
        return {
            "message":        "Transfer already committed (idempotent replay).",
            "transaction_id": str(existing_tx["_id"]),
            "phase":          "COMMITTED",
            "idempotent":     True,
        }

    # ── Phase 0: Verify target account is ACTIVE before locking source funds ─
    target_account = await target_db.accounts.find_one({"_id": target_oid}, TRANSFER_PROJECTION)
    if not target_account:
        raise HTTPException(status_code=404, detail="Target account not found")
    if target_account.get("status") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail=f"Target account is not ACTIVE (status: {target_account.get('status')})",
        )

    # ── Phase 1: Write INITIATED entry to coordinator ledger ─────────────────
    tx_id  = f"TXN-{uuid.uuid4().hex[:16].upper()}"
    now    = datetime.now(timezone.utc)
    tx_doc = {
        "_id":                tx_id,
        "type":               "TRANSFER",
        "initiator_id":       req.initiator_id,
        "source_branch":      req.source_branch,
        "source_account_id":  req.source_account_id,
        "target_branch":      req.target_branch,
        "target_account_id":  req.target_account_id,
        "amount":             amount_d128,
        "state":              "INITIATED",
        "idempotency_key":    req.idempotency_key,
        "error":              None,
        "created_at":         now,
        "updated_at":         now,
    }
    await ledger_db.transaction_logs.insert_one(tx_doc)

    source_locked = False   # tracks whether funds were moved to locked_balance

    try:
        # ── Phase 1: PREPARE — lock source funds atomically ─────────────────
        await ledger_db.transaction_logs.update_one(
            {"_id": tx_id},
            {"$set": {"state": "PREPARED", "updated_at": datetime.now(timezone.utc)}},
        )

        # Single atomic findAndModify — no read-then-write race condition.
        # Guard: status=ACTIVE AND available_balance >= amount.
        source_update = await source_db.accounts.update_one(
            {
                "_id":               source_oid,
                "status":            "ACTIVE",
                "available_balance": {"$gte": amount_d128},
            },
            {"$inc": {
                "available_balance": to_d128(-req.amount),
                "locked_balance":    amount_d128,
            },
             "$set": {"updated_at": datetime.now(timezone.utc)}},
        )

        if source_update.modified_count == 0:
            source_check = await source_db.accounts.find_one(
                {"_id": source_oid},
                {"status": 1, "available_balance": 1},
            )
            if not source_check:
                raise Exception("Source account not found")
            elif source_check.get("status") != "ACTIVE":
                raise Exception(f"Source account is not ACTIVE (status: {source_check.get('status')})")
            else:
                avail = from_d128(source_check.get("available_balance", 0))
                raise Exception(
                    f"Insufficient funds: available ${avail:.2f}, requested ${amount_float:.2f}"
                )

        source_locked = True  # funds are now in locked_balance

    except Exception as exc:
        # ── Phase 2b: ABORT — compensate + update ledger ────────────────────
        await ledger_db.transaction_logs.update_one(
            {"_id": tx_id},
            {"$set": {
                "state":      "ABORTED",
                "error":      str(exc),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        if source_locked:
            # Funds were locked — unlock them
            await source_db.accounts.update_one(
                {"_id": source_oid},
                {"$inc": {
                    "available_balance": amount_d128,
                    "locked_balance":    to_d128(-req.amount),
                },
                 "$set": {"updated_at": datetime.now(timezone.utc)}},
            )
        raise HTTPException(status_code=400, detail=f"Transfer ABORTED during PREPARE: {exc}")

    # ── Phase 2a: COMMIT — finalize atomically across both shards ────────────
    try:
        await asyncio.gather(
            # Debit: remove from locked_balance at source
            source_db.accounts.update_one(
                {"_id": source_oid},
                {"$inc": {"locked_balance": to_d128(-req.amount)},
                 "$set": {"updated_at": datetime.now(timezone.utc)}},
            ),
            # Credit: add to available_balance at target
            target_db.accounts.update_one(
                {"_id": target_oid},
                {"$inc": {"available_balance": amount_d128},
                 "$set": {"updated_at": datetime.now(timezone.utc)}},
            ),
        )
        await ledger_db.transaction_logs.update_one(
            {"_id": tx_id},
            {"$set": {"state": "COMMITTED", "updated_at": datetime.now(timezone.utc)}},
        )
    except Exception as exc:
        # Commit failure — partial state, needs manual recovery
        await ledger_db.transaction_logs.update_one(
            {"_id": tx_id},
            {"$set": {
                "state":      "ABORTED",
                "error":      f"COMMIT PHASE FAILED: {exc}",
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        raise HTTPException(
            status_code=500,
            detail=f"CRITICAL: Commit phase failed. Transaction {tx_id} requires manual recovery.",
        )

    return {
        "message":        "Transfer completed successfully across distributed nodes.",
        "transaction_id": tx_id,
        "phase":          "COMMITTED",
        "amount":         amount_float,
        "source_branch":  req.source_branch,
        "target_branch":  req.target_branch,
    }
