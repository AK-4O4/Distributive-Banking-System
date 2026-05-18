# database.py — Index creation & query optimization helpers
import asyncio
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING


async def ensure_indexes(db: AsyncIOMotorDatabase, branch_id: str):
    """
    QUERY OPTIMIZATION: Create compound indexes on startup.

    Indexes created:
      - customer_id (ASC)        → fast lookup by customer
      - status (ASC)             → fast filter for ACTIVE accounts
      - compound (branch_id, customer_id) → covers fragmented queries
      - available_balance (DESC) → range queries for balance checks
    All are background=True so they don't block existing reads/writes.
    """
    coll = db.accounts
    await asyncio.gather(
        coll.create_index([("customer_id", ASCENDING)], background=True, name="idx_customer_id"),
        coll.create_index([("status", ASCENDING)], background=True, name="idx_status"),
        coll.create_index(
            [("branch_id", ASCENDING), ("customer_id", ASCENDING)],
            background=True,
            name="idx_branch_customer",
        ),
        coll.create_index([("available_balance", DESCENDING)], background=True, name="idx_balance_desc"),
    )
    print(f"  ✓ Indexes ensured for branch: {branch_id}")


async def ensure_ledger_indexes(ledger_db: AsyncIOMotorDatabase):
    """QUERY OPTIMIZATION: Indexes on the coordinator ledger."""
    coll = ledger_db.global_transactions
    await asyncio.gather(
        coll.create_index([("state", ASCENDING)], background=True, name="idx_state"),
        coll.create_index([("created_at", DESCENDING)], background=True, name="idx_created_at"),
        coll.create_index([("source_branch", ASCENDING)], background=True, name="idx_source_branch"),
        coll.create_index([("target_branch", ASCENDING)], background=True, name="idx_target_branch"),
        # Compound for recovery queries: find all PENDING/PREPARED transactions
        coll.create_index(
            [("state", ASCENDING), ("created_at", ASCENDING)],
            background=True,
            name="idx_state_created",
        ),
    )
    print("  ✓ Indexes ensured for coordinator ledger")


# ─── Projection helpers ───────────────────────────────────────────────────────
# QUERY OPTIMIZATION: never fetch fields you don't need.

# Used for list/search — excludes heavy fields if added later (e.g., audit_log array)
ACCOUNT_PROJECTION = {
    "_id": 1,
    "customer_id": 1,
    "customer_name": 1,
    "branch_id": 1,
    "available_balance": 1,
    "locked_balance": 1,
    "status": 1,
    "created_at": 1,
}

# Used for transfer prepare — only need balance + status
TRANSFER_PROJECTION = {
    "_id": 1,
    "available_balance": 1,
    "locked_balance": 1,
    "status": 1,
}
