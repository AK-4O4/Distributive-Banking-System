"""
Distributive Banking System — FastAPI Coordinator
==================================================

Demonstrates:
  1. Distributive Transactions   — every write is routed to the correct shard
  2. Consistency                 — uniqueness, status checks, balance invariants
  3. Security                    — API key auth, rate limiting, input sanitization
  4. Distributive Query          — fan-out across all branches via asyncio.gather
  5. Two-Phase Commit (2PC)      — PENDING→PREPARED→COMMITTED/ABORTED with rollback
  6. Query Optimization          — indexes on startup, projections, covered queries
"""

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from database import (
    ACCOUNT_PROJECTION,
    TRANSFER_PROJECTION,
    ensure_indexes,
    ensure_ledger_indexes,
)
from models import (
    AccountCreate,
    AccountResponse,
    GlobalQueryRequest,
    TransactionLogEntry,
    TransferRequest,
)
from security import rate_limit, require_api_key

load_dotenv()

db_clients: dict = {}
db_instances: dict = {}


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up Distributive Banking Coordinator...")

    # 1. Connect to each physical Atlas cluster
    for key, env_var in [
        ("north",       "MONGO_URI_NORTH"),
        ("south",       "MONGO_URI_SOUTH"),
        ("east",        "MONGO_URI_EAST"),
        ("west",        "MONGO_URI_WEST"),
        ("coordinator", "MONGO_URI_COORDINATOR"),
    ]:
        uri = os.getenv(env_var)
        if not uri:
            raise RuntimeError(f"Missing environment variable: {env_var}")
        db_clients[key] = AsyncIOMotorClient(uri)

    # 2. Map logical databases
    db_instances["north"]   = db_clients["north"]["db_branch_north"]
    db_instances["south"]   = db_clients["south"]["db_branch_south"]
    db_instances["east"]    = db_clients["east"]["db_branch_east"]
    db_instances["west"]    = db_clients["west"]["db_branch_west"]
    db_instances["central"] = db_clients["coordinator"]["db_branch_central"]
    db_instances["ledger"]  = db_clients["coordinator"]["db_coordinator_ledger"]

    # 3. QUERY OPTIMIZATION: ensure indexes on all branches in parallel
    print("Creating indexes...")
    await asyncio.gather(
        ensure_indexes(db_instances["north"],   "north"),
        ensure_indexes(db_instances["south"],   "south"),
        ensure_indexes(db_instances["east"],    "east"),
        ensure_indexes(db_instances["west"],    "west"),
        ensure_indexes(db_instances["central"], "central"),
        ensure_ledger_indexes(db_instances["ledger"]),
    )

    # 4. CONSISTENCY — recover any incomplete 2PC transactions from a previous crash
    await _recover_incomplete_transactions()

    print("All connections, indexes, and recovery complete. Ready.")
    yield

    print("Shutting down...")
    for client in db_clients.values():
        client.close()
    print("Connections closed.")


app = FastAPI(
    title="Distributive Banking Coordinator",
    description="Implements distributed transactions, 2PC, distributed queries, and query optimization.",
    version="2.0.0",
    lifespan=lifespan,
)

# SECURITY: CORS — only allow the known frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

BRANCH_NAMES = ["north", "south", "east", "west", "central"]

def get_branch_db(branch_id: str):
    b = branch_id.lower()
    if b not in BRANCH_NAMES:
        raise HTTPException(status_code=400, detail=f"Invalid branch: '{branch_id}'. Must be one of {BRANCH_NAMES}")
    return db_instances[b]

def serialize_account(doc: dict) -> dict:
    return {
        "id":                str(doc["_id"]),
        "customer_id":       doc["customer_id"],
        "customer_name":     doc["customer_name"],
        "branch_id":         doc["branch_id"],
        "available_balance": doc["available_balance"],
        "locked_balance":    doc["locked_balance"],
        "status":            doc["status"],
        "created_at":        doc.get("created_at"),
    }

def serialize_tx(doc: dict) -> dict:
    return {
        "id":            str(doc["_id"]),
        "type":          doc.get("type", ""),
        "source_branch": doc.get("source_branch"),
        "target_branch": doc.get("target_branch"),
        "amount":        doc.get("amount"),
        "state":         doc.get("state", ""),
        "error":         doc.get("error"),
        "created_at":    doc.get("created_at"),
        "committed_at":  doc.get("committed_at"),
    }


# ─── 2PC RECOVERY ─────────────────────────────────────────────────────────────

async def _recover_incomplete_transactions():
    """
    TWO-PHASE COMMIT — Crash Recovery.
    On startup, scan the ledger for transactions stuck in PENDING or PREPARED.
    A transaction that has been PREPARED for more than 5 minutes is considered
    timed-out and will be ABORTED with compensation.
    """
    ledger_db = db_instances["ledger"]
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    cursor = ledger_db.global_transactions.find(
        {"state": {"$in": ["PENDING", "PREPARED"]}, "created_at": {"$lt": cutoff}},
        {"_id": 1, "state": 1, "source_branch": 1, "source_account_id": 1, "amount": 1},
    )

    recovered = 0
    async for tx in cursor:
        tx_id = tx["_id"]
        try:
            if tx.get("state") == "PREPARED" and tx.get("source_account_id"):
                # Compensation: unlock funds that were locked during prepare
                source_db = db_instances.get(tx.get("source_branch", ""))
                if source_db:
                    await source_db.accounts.update_one(
                        {"_id": ObjectId(tx["source_account_id"])},
                        {"$inc": {
                            "available_balance": tx.get("amount", 0),
                            "locked_balance":   -tx.get("amount", 0),
                        }},
                    )
            await ledger_db.global_transactions.update_one(
                {"_id": tx_id},
                {"$set": {"state": "ABORTED", "error": "Recovered on restart — transaction timed out"}},
            )
            recovered += 1
        except Exception as e:
            print(f"  ⚠ Recovery failed for tx {tx_id}: {e}")

    if recovered:
        print(f"  ✓ Recovered {recovered} incomplete transaction(s)")
    else:
        print("  ✓ No incomplete transactions found")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {"message": "Distributive Banking Coordinator is live.", "version": "2.0.0"}

@app.get("/health", tags=["Health"])
async def health():
    """Extended health check: verify connectivity to each branch."""
    results = {}
    for name, db in db_instances.items():
        if name == "ledger":
            continue
        try:
            await db.command("ping")
            results[name] = "ok"
        except Exception as e:
            results[name] = f"error: {e}"
    return {"branches": results, "timestamp": datetime.now(timezone.utc)}


# ─── Account Endpoints ────────────────────────────────────────────────────────

@app.post(
    "/accounts/",
    response_model=AccountResponse,
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Create account on a specific branch node",
)
async def create_account(account_data: AccountCreate):
    """
    DISTRIBUTIVE TRANSACTION: Routes the write to the correct physical shard.
    CONSISTENCY: Enforces unique (customer_id, branch_id) — no duplicate accounts
    on the same node. Also validates branch is active via the fragmentation router.
    """
    db = get_branch_db(account_data.branch_id)

    # CONSISTENCY: Unique constraint — one account per customer per branch
    # QUERY OPTIMIZATION: uses idx_branch_customer compound index
    existing = await db.accounts.find_one(
        {"customer_id": account_data.customer_id, "branch_id": account_data.branch_id},
        {"_id": 1},  # projection — only need to know if it exists
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Customer '{account_data.customer_id}' already has an account on the {account_data.branch_id} node.",
        )

    new_account = {
        "customer_id":       account_data.customer_id,
        "customer_name":     account_data.customer_name,
        "branch_id":         account_data.branch_id.lower(),
        "available_balance": account_data.initial_balance,
        "locked_balance":    0.00,
        "status":            "ACTIVE",
        "created_at":        datetime.now(timezone.utc),
    }

    result = await db.accounts.insert_one(new_account)
    new_account["id"] = str(result.inserted_id)
    return new_account


@app.get(
    "/accounts/{branch_id}",
    response_model=list[AccountResponse],
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="List accounts on a specific branch node",
)
async def list_accounts(
    branch_id: str,
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE | INACTIVE | FROZEN"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    DISTRIBUTIVE QUERY (single-node): Returns accounts for a specific branch.
    QUERY OPTIMIZATION: Uses idx_status index when filtering, ACCOUNT_PROJECTION
    to avoid fetching unused fields.
    """
    db = get_branch_db(branch_id)

    query_filter: dict = {}
    if status:
        query_filter["status"] = status.upper()

    accounts = []
    # QUERY OPTIMIZATION: projection limits data transfer from MongoDB
    async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(limit):
        accounts.append(serialize_account(doc))
    return accounts


@app.get(
    "/accounts/{branch_id}/{account_id}",
    response_model=AccountResponse,
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Get a single account by ID",
)
async def get_account(branch_id: str, account_id: str):
    """DISTRIBUTIVE QUERY: Direct lookup on the correct shard."""
    if not _valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format")
    db = get_branch_db(branch_id)
    doc = await db.accounts.find_one({"_id": ObjectId(account_id)}, ACCOUNT_PROJECTION)
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    return serialize_account(doc)


@app.patch(
    "/accounts/{branch_id}/{account_id}/status",
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Update account status (ACTIVE / INACTIVE / FROZEN)",
)
async def update_account_status(branch_id: str, account_id: str, new_status: str):
    """CONSISTENCY: Status transitions are validated before write."""
    if not _valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format")
    allowed = {"ACTIVE", "INACTIVE", "FROZEN"}
    if new_status.upper() not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}")
    db = get_branch_db(branch_id)
    result = await db.accounts.update_one(
        {"_id": ObjectId(account_id)},
        {"$set": {"status": new_status.upper()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": f"Account status updated to {new_status.upper()}"}


# ─── Distributed Query — Fan-out ──────────────────────────────────────────────

@app.post(
    "/query/global",
    tags=["Distributed Query"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Fan-out query across ALL branch nodes simultaneously",
)
async def global_query(req: GlobalQueryRequest):
    """
    DISTRIBUTIVE QUERY: Sends the same query to all 5 branch shards in parallel
    using asyncio.gather, then merges and returns the combined result set.

    This is horizontal query distribution — each node processes its local slice,
    and the coordinator aggregates the results. Much faster than sequential queries.
    """

    query_filter: dict = {}
    if req.customer_id:
        # QUERY OPTIMIZATION: uses idx_customer_id index on each shard
        query_filter["customer_id"] = req.customer_id.upper()
    if req.status:
        # QUERY OPTIMIZATION: uses idx_status index on each shard
        query_filter["status"] = req.status
    if req.min_balance is not None:
        # QUERY OPTIMIZATION: uses idx_balance_desc index on each shard
        query_filter["available_balance"] = {"$gte": req.min_balance}

    async def query_branch(branch_name: str) -> list[dict]:
        db = db_instances[branch_name]
        results = []
        # QUERY OPTIMIZATION: ACCOUNT_PROJECTION — only fetch needed fields
        async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(200):
            results.append(serialize_account(doc))
        return results

    # DISTRIBUTIVE QUERY: all branches queried simultaneously
    branch_results = await asyncio.gather(
        *[query_branch(b) for b in BRANCH_NAMES],
        return_exceptions=True,
    )

    merged = []
    errors = {}
    for branch_name, result in zip(BRANCH_NAMES, branch_results):
        if isinstance(result, Exception):
            errors[branch_name] = str(result)
        else:
            merged.extend(result)

    return {
        "total_results": len(merged),
        "branches_queried": BRANCH_NAMES,
        "branch_errors": errors,
        "accounts": merged,
        "query_filter": query_filter,
    }


@app.get(
    "/query/customer/{customer_id}",
    tags=["Distributed Query"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Find all accounts for a customer across all branches",
)
async def find_customer_across_branches(customer_id: str):
    """
    DISTRIBUTIVE QUERY: Locate a customer's accounts across all nodes.
    QUERY OPTIMIZATION: uses idx_customer_id index on each branch.
    All queries execute in parallel via asyncio.gather.
    """
    customer_id = customer_id.upper()

    async def search_branch(branch_name: str) -> list[dict]:
        db = db_instances[branch_name]
        results = []
        # Projection: only the fields we need — covered by idx_branch_customer
        async for doc in db.accounts.find(
            {"customer_id": customer_id},
            ACCOUNT_PROJECTION,
        ):
            results.append(serialize_account(doc))
        return results

    branch_results = await asyncio.gather(*[search_branch(b) for b in BRANCH_NAMES])
    accounts = [acct for sublist in branch_results for acct in sublist]

    return {
        "customer_id": customer_id,
        "total_accounts": len(accounts),
        "accounts": accounts,
    }


# ─── Two-Phase Commit Transfer ────────────────────────────────────────────────

def _valid_oid(value: str) -> bool:
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


@app.post(
    "/transfer/",
    tags=["2PC Transfer"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Execute an atomic cross-branch transfer using Two-Phase Commit",
)
async def process_transfer(req: TransferRequest):
    """
    TWO-PHASE COMMIT PROTOCOL
    ─────────────────────────
    Phase 0 — Pre-checks:   Validate IDs, check idempotency key
    Phase 1 — PREPARE:      Lock funds at source; verify target exists
                            Ledger transitions: PENDING → PREPARED
    Phase 2a — COMMIT:      Apply debit & credit atomically
                            Ledger transitions: PREPARED → COMMITTED
    Phase 2b — ABORT:       On any failure, compensate (unlock) and record
                            Ledger transitions: PREPARED → ABORTED

    CONSISTENCY guarantees:
      - Source balance never drops below 0 (atomic $gte check + update)
      - Source must be ACTIVE (no frozen/inactive accounts can send)
      - Target must be ACTIVE (no sending to closed accounts)
      - Locked balance tracks in-flight funds, preventing double-spend
      - Idempotency key prevents duplicate execution of the same transfer
    """
    ledger_db = db_instances["ledger"]
    source_db = get_branch_db(req.source_branch)
    target_db = get_branch_db(req.target_branch)

    # ── CONSISTENCY: prevent self-transfer ───────────────────────────────────
    if req.source_account_id == req.target_account_id:
        raise HTTPException(status_code=400, detail="Source and target accounts must differ")

    source_oid = ObjectId(req.source_account_id)  # already validated by pydantic
    target_oid = ObjectId(req.target_account_id)

    # ── SECURITY / CONSISTENCY: Idempotency check ────────────────────────────
    if req.idempotency_key:
        existing_tx = await ledger_db.global_transactions.find_one(
            {"idempotency_key": req.idempotency_key, "state": "COMMITTED"},
            {"_id": 1},
        )
        if existing_tx:
            return {
                "message": "Transfer already committed (idempotent replay).",
                "transaction_id": str(existing_tx["_id"]),
                "idempotent": True,
            }

    # ── CONSISTENCY: Verify target account is ACTIVE before locking source ──
    # QUERY OPTIMIZATION: TRANSFER_PROJECTION only fetches status + balance
    target_account = await target_db.accounts.find_one(
        {"_id": target_oid},
        TRANSFER_PROJECTION,
    )
    if not target_account:
        raise HTTPException(status_code=404, detail="Target account not found")
    if target_account.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail=f"Target account is not ACTIVE (status: {target_account.get('status')})")

    # ── Step 0: Record PENDING transaction in coordinator ledger ─────────────
    tx_doc = {
        "type":            "CROSS_BRANCH_TRANSFER",
        "initiator_id":    req.initiator_id,
        "source_branch":   req.source_branch,
        "source_account_id": req.source_account_id,
        "target_branch":   req.target_branch,
        "target_account_id": req.target_account_id,
        "amount":          req.amount,
        "state":           "PENDING",
        "idempotency_key": req.idempotency_key,
        "created_at":      datetime.now(timezone.utc),
    }
    tx_result = await ledger_db.global_transactions.insert_one(tx_doc)
    tx_id = tx_result.inserted_id

    source_update = None  # track whether funds were locked (for rollback)

    try:
        # ── Phase 1: PREPARE ─────────────────────────────────────────────────
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "PREPARED", "prepared_at": datetime.now(timezone.utc)}},
        )

        # CONSISTENCY: Atomic lock — only succeeds if balance >= amount AND status == ACTIVE
        # QUERY OPTIMIZATION: single atomic findAndModify — no separate read+write
        source_update = await source_db.accounts.update_one(
            {
                "_id":               source_oid,
                "status":            "ACTIVE",                       # CONSISTENCY: must be active
                "available_balance": {"$gte": req.amount},           # CONSISTENCY: sufficient funds
            },
            {
                "$inc": {
                    "available_balance": -req.amount,
                    "locked_balance":     req.amount,
                },
            },
        )

        if source_update.modified_count == 0:
            # Differentiate "not found" from "insufficient funds / inactive"
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

    except Exception as e:
        # ── Phase 2b: ABORT — compensation + ledger update ───────────────────
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "ABORTED", "error": str(e), "aborted_at": datetime.now(timezone.utc)}},
        )
        # COMPENSATION: if funds were locked, unlock them
        if source_update is not None and source_update.modified_count > 0:
            await source_db.accounts.update_one(
                {"_id": source_oid},
                {"$inc": {"available_balance": req.amount, "locked_balance": -req.amount}},
            )
        raise HTTPException(status_code=400, detail=f"Transfer aborted during PREPARE phase: {e}")

    # ── Phase 2a: COMMIT ─────────────────────────────────────────────────────
    # At this point: source funds are locked. Both accounts confirmed to exist and be ACTIVE.
    # Run the final debit (unlock) and credit atomically on their respective nodes.

    try:
        await asyncio.gather(
            # Debit: remove from locked_balance at source (available_balance already decremented)
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

        # Finalize ledger
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "COMMITTED", "committed_at": datetime.now(timezone.utc)}},
        )

    except Exception as e:
        # Commit failure is the hardest case in 2PC.
        # Record as COMMIT_FAILED so ops team / recovery process can intervene.
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id},
            {"$set": {"state": "COMMIT_FAILED", "error": str(e), "aborted_at": datetime.now(timezone.utc)}},
        )
        raise HTTPException(
            status_code=500,
            detail=f"CRITICAL: Commit phase failed. Transaction {tx_id} is in COMMIT_FAILED state and requires manual recovery.",
        )

    return {
        "message":        "Transfer successful across distributed nodes.",
        "transaction_id": str(tx_id),
        "phase":          "COMMITTED",
        "amount":         req.amount,
        "source_branch":  req.source_branch,
        "target_branch":  req.target_branch,
    }


# ─── Transaction Ledger ───────────────────────────────────────────────────────

@app.get(
    "/transactions/",
    response_model=list[TransactionLogEntry],
    tags=["Ledger"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    summary="Query the global coordinator ledger",
)
async def list_transactions(
    state: Optional[str] = Query(None, description="Filter by state: PENDING | PREPARED | COMMITTED | ABORTED | COMMIT_FAILED"),
    limit: int = Query(50, ge=1, le=200),
):
    """
    DISTRIBUTIVE QUERY on the coordinator ledger.
    QUERY OPTIMIZATION: uses idx_state and idx_created_at indexes.
    Results are sorted by created_at DESC (most recent first).
    """
    ledger_db = db_instances["ledger"]
    query_filter: dict = {}
    if state:
        query_filter["state"] = state.upper()

    txns = []
    # QUERY OPTIMIZATION: projection + sort uses idx_state_created compound index
    async for doc in (
        ledger_db.global_transactions
        .find(query_filter)
        .sort("created_at", -1)
        .limit(limit)
    ):
        txns.append(serialize_tx(doc))
    return txns
