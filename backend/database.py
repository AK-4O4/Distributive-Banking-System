# database.py — Index creation & query optimization helpers
# Updated for v2 schema:
#   - Branch accounts now use "branch" (not "branch_id")
#   - Coordinator uses "transaction_logs" collection (not "global_transactions")
#   - Customer collection ("customers") on a dedicated db_customers database

import asyncio
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING


async def ensure_indexes(db: AsyncIOMotorDatabase, branch: str):
    """
    QUERY OPTIMIZATION: Create compound indexes on each branch shard on startup.

    Indexes created on accounts collection:
      - customer_id (ASC)            -> fast lookup by customer across branch
      - status (ASC)                 -> fast filter for ACTIVE/FROZEN accounts
      - compound (branch, customer_id) -> covers fragmented fan-out queries
      - available_balance (DESC)     -> range queries for balance checks (transfers)
      - account_number (ASC, unique) -> unique account number lookups
    All are background=True to avoid blocking existing operations.
    """
    coll = db.accounts
    indexes = [
        coll.create_index([("customer_id", ASCENDING)],  background=True, name="idx_customer_id"),
        coll.create_index([("status", ASCENDING)],       background=True, name="idx_status"),
        coll.create_index(
            [("branch", ASCENDING), ("customer_id", ASCENDING)],
            background=True, name="idx_branch_customer",
        ),
        coll.create_index([("available_balance", DESCENDING)], background=True, name="idx_balance_desc"),
        coll.create_index([("account_number", ASCENDING)],     background=True, name="idx_account_number", unique=True),
    ]
    for coro in indexes:
        try:
            await coro
        except Exception as e:
            print(f"  [!] Index creation error: {e}")
    print(f"  [OK] Indexes ensured for branch: {branch}")


async def ensure_ledger_indexes(ledger_db: AsyncIOMotorDatabase):
    """
    QUERY OPTIMIZATION: Indexes on the coordinator's transaction_logs collection.
    Also creates indexes on the admin_users collection.
    """
    coll = ledger_db.transaction_logs
    await asyncio.gather(
        coll.create_index([("state", ASCENDING)],                           background=True, name="idx_state"),
        coll.create_index([("created_at", DESCENDING)],                     background=True, name="idx_created_at"),
        coll.create_index([("idempotency_key", ASCENDING)],                 background=True, name="idx_idempotency", unique=True),
        coll.create_index([("source_branch", ASCENDING)],                   background=True, name="idx_source_branch"),
        coll.create_index([("target_branch", ASCENDING)],                   background=True, name="idx_target_branch"),
        coll.create_index([("state", ASCENDING), ("created_at", ASCENDING)],background=True, name="idx_state_created"),
    )
    # Index admin_users by _id (admin_id) — MongoDB does this by default,
    # but we create a compound index for password_hash lookups too.
    await ledger_db.admin_users.create_index([("_id", ASCENDING)], name="idx_admin_id")
    print("  [OK] Indexes ensured for coordinator ledger + admin_users")


async def ensure_customer_indexes(customers_db: AsyncIOMotorDatabase):
    """
    QUERY OPTIMIZATION: Indexes on the global customers collection.
    customer_id is used as the MongoDB _id — already indexed as primary key.
    We add an index on customer_name for name-based search.
    """
    coll = customers_db.customers
    await coll.create_index([("customer_name", ASCENDING)], background=True, name="idx_customer_name")
    print("  [OK] Indexes ensured for global customers collection")


# ─── Projection helpers ───────────────────────────────────────────────────────
# QUERY OPTIMIZATION: never fetch fields you don't need.

# Full account projection — all fields needed for display
ACCOUNT_PROJECTION = {
    "_id": 1,
    "account_number": 1,
    "account_title": 1,
    "customer_id": 1,
    "branch": 1,
    "available_balance": 1,
    "locked_balance": 1,
    "status": 1,
    "created_at": 1,
}

# Minimal projection for 2PC transfer checks — only balance + status
TRANSFER_PROJECTION = {
    "_id": 1,
    "available_balance": 1,
    "locked_balance": 1,
    "status": 1,
    "branch": 1,
}
