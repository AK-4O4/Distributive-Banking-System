# recovery.py — Two-Phase Commit crash recovery
# ----------------------------------------------
# On every coordinator startup, scan transaction_logs for transactions left in
# INITIATED or PREPARED state (e.g., after a crash mid-protocol).
# Any PREPARED transaction older than 5 minutes is compensated (funds unlocked)
# and marked ABORTED. INITIATED transactions are simply marked ABORTED.

from datetime import datetime, timezone, timedelta
from bson import ObjectId
from helpers import from_d128, to_d128
import state


async def recover_incomplete_transactions() -> None:
    """
    TWO-PHASE COMMIT — Crash Recovery.

    Scans the coordinator ledger's transaction_logs for stuck transactions
    and compensates them on startup.

    States targeted:
      - INITIATED: Transaction was logged but PREPARE never ran -> mark ABORTED
      - PREPARED:  Funds were locked but COMMIT never completed -> unlock + ABORTED
    """
    ledger_db = state.db_instances["ledger"]
    cutoff    = datetime.now(timezone.utc) - timedelta(minutes=5)

    cursor = ledger_db.transaction_logs.find(
        {
            "state":      {"$in": ["INITIATED", "PREPARED"]},
            "created_at": {"$lt": cutoff},
        },
        {"_id": 1, "state": 1, "source_branch": 1, "source_account_id": 1, "amount": 1},
    )

    recovered = 0
    async for tx in cursor:
        tx_id = tx["_id"]
        try:
            # PREPARED -> compensate: unlock funds that were locked during Phase 1
            if tx.get("state") == "PREPARED" and tx.get("source_account_id"):
                branch_key = (tx.get("source_branch") or "").lower()
                source_db  = state.db_instances.get(branch_key)
                if source_db:
                    amount = from_d128(tx.get("amount", 0))
                    await source_db.accounts.update_one(
                        {"_id": ObjectId(tx["source_account_id"])},
                        {"$inc": {
                            "available_balance":  to_d128(amount),
                            "locked_balance":    to_d128(-amount),
                        }},
                    )

            await ledger_db.transaction_logs.update_one(
                {"_id": tx_id},
                {"$set": {
                    "state":      "ABORTED",
                    "error":      "Recovered on restart — transaction timed out",
                    "updated_at": datetime.now(timezone.utc),
                }},
            )
            recovered += 1
        except Exception as exc:
            print(f"  [!!] Recovery failed for tx {tx_id}: {exc}")

    if recovered:
        print(f"  [OK] Recovered {recovered} incomplete transaction(s)")
    else:
        print("  [OK] No incomplete transactions found")
