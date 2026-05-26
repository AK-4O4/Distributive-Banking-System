# routes/accounts.py — Account management endpoints
# ───────────────────────────────────────────────────
# Handles account creation, listing, individual lookup, and status updates.
# All writes are routed to the correct physical shard via get_branch_db().

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from database import ACCOUNT_PROJECTION
from helpers import get_branch_db, serialize_account, valid_oid
from models import AccountCreate, AccountResponse
from security import rate_limit, require_api_key

router = APIRouter(
    prefix="/accounts",
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


@router.post(
    "/",
    response_model=AccountResponse,
    summary="Create a new account on a specific branch node",
)
async def create_account(account_data: AccountCreate):
    """
    DISTRIBUTIVE TRANSACTION: Routes the write to the correct physical shard.

    CONSISTENCY: Enforces a unique (customer_id, branch_id) constraint — a customer
    can hold only one account per branch node. Uses the idx_branch_customer compound
    index for the existence check (QUERY OPTIMIZATION).
    """
    db = get_branch_db(account_data.branch_id)

    # CONSISTENCY: one account per customer per branch
    existing = await db.accounts.find_one(
        {"customer_id": account_data.customer_id, "branch_id": account_data.branch_id},
        {"_id": 1},  # projection — only need the existence signal
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Customer '{account_data.customer_id}' already has an account "
                f"on the {account_data.branch_id} branch node."
            ),
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


@router.get(
    "/{branch_id}",
    response_model=list[AccountResponse],
    summary="List all accounts on a specific branch node",
)
async def list_accounts(
    branch_id: str,
    status: Optional[str] = Query(None, description="Filter: ACTIVE | INACTIVE | FROZEN"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    DISTRIBUTIVE QUERY (single-node): Returns accounts for one branch shard.

    QUERY OPTIMIZATION: Uses idx_status index when filtering by status, and
    ACCOUNT_PROJECTION to avoid over-fetching unused fields.
    """
    db = get_branch_db(branch_id)
    query_filter: dict = {}
    if status:
        query_filter["status"] = status.upper()

    accounts = []
    async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(limit):
        accounts.append(serialize_account(doc))
    return accounts


@router.get(
    "/{branch_id}/{account_id}",
    response_model=AccountResponse,
    summary="Fetch a single account by branch and MongoDB ID",
)
async def get_account(branch_id: str, account_id: str):
    """
    DISTRIBUTIVE QUERY: Direct lookup on the correct shard using the primary key.
    """
    if not valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format (expected 24-char hex)")
    db = get_branch_db(branch_id)
    doc = await db.accounts.find_one({"_id": ObjectId(account_id)}, ACCOUNT_PROJECTION)
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    return serialize_account(doc)


@router.patch(
    "/{branch_id}/{account_id}/status",
    summary="Update account status: ACTIVE | INACTIVE | FROZEN",
)
async def update_account_status(branch_id: str, account_id: str, new_status: str):
    """
    CONSISTENCY: Status transitions are validated before the write is applied.
    Only the three allowed states are accepted — no arbitrary status strings.
    """
    if not valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format")

    allowed = {"ACTIVE", "INACTIVE", "FROZEN"}
    normalized = new_status.upper()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {sorted(allowed)}")

    db = get_branch_db(branch_id)
    result = await db.accounts.update_one(
        {"_id": ObjectId(account_id)},
        {"$set": {"status": normalized}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")

    return {"message": f"Account status updated to {normalized}", "new_status": normalized}
