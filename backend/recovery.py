# recovery.py — Two-Phase Commit crash recovery
# ──────────────────────────────────────────────
# On every coordinator startup, scan the ledger for transactions that were
# left in PENDING or PREPARED state (e.g. after a crash mid-protocol).
# Any PREPARED transaction older than 5 minutes is compensated (funds unlocked)
# and marked ABORTED. PENDING transactions are simply marked ABORTED.

from datetime import datetime, timezone, timedelta
from bson import ObjectId
import state


async def recover_incomplete_transactions() -> None:
    """
    TWO-PHASE COMMIT — Crash Recovery.

    Scans the coordinator ledger for stuck transactions and compensates them.
    A transaction stuck in PREPARED for > 5 minutes is considered timed-out.
    """
    ledger_db = state.db_instances["ledger"]
    cutoff    = datetime.now(timezone.utc) - timedelta(minutes=5)

    cursor = ledger_db.global_transactions.find(
        {"state": {"$in": ["PENDING", "PREPARED"]}, "created_at": {"$lt": cutoff}},
        {"_id": 1, "state": 1, "source_branch": 1, "source_account_id": 1, "amount": 1},
    )

    recovered = 0
    async for tx in cursor:
        tx_id = tx["_id"]
        try:
            # PREPARED → compensate: unlock funds that were locked during Phase 1
            if tx.get("state") == "PREPARED" and tx.get("source_account_id"):
                source_db = state.db_instances.get(tx.get("source_branch", ""))
                if source_db:
                    await source_db.accounts.update_one(
                        {"_id": ObjectId(tx["source_account_id"])},
                        {"$inc": {
                            "available_balance":  tx.get("amount", 0),
                            "locked_balance":    -tx.get("amount", 0),
                        }},
                    )

            await ledger_db.global_transactions.update_one(
                {"_id": tx_id},
                {"$set": {
                    "state": "ABORTED",
                    "error": "Recovered on restart — transaction timed out",
                }},
            )
            recovered += 1
        except Exception as exc:
            print(f"  ⚠ Recovery failed for tx {tx_id}: {exc}")

    if recovered:
        print(f"  ✓ Recovered {recovered} incomplete transaction(s)")
    else:
        print("  ✓ No incomplete transactions found")
