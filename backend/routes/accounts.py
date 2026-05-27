# routes/accounts.py — Branch account management endpoints
# ---------------------------------------------------------
# Updated for v2 schema:
#   - customer_id + branch (uppercase) -> one account per customer per branch
#   - account_number: "ACC-{CUSTOMER_ID}-{BRANCH}" (unique key)
#   - account_title: customer's display name from CustomerDB
#   - Balances stored as Decimal128 via to_d128()
#   - Customer MUST be registered in db_customers before opening an account

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from database import ACCOUNT_PROJECTION
from helpers import get_branch_db, serialize_account, to_d128, valid_oid
from models import AccountCreate, AccountResponse
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/accounts",
    tags=["Accounts"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


@router.post(
    "/",
    response_model=AccountResponse,
    summary="Open a new account on a specific branch shard",
)
async def create_account(account_data: AccountCreate):
    """
    DISTRIBUTIVE WRITE: Routes the insert to the correct physical branch shard.

    PRE-CONDITION: customer_id must already exist in db_customers.customers.
    This enforces data normalization — identity lives in the global customer
    registry, not embedded in each branch account.

    CONSISTENCY: Unique compound index (branch, customer_id) ensures one account
    per customer per branch node. Balances stored as MongoDB NumberDecimal.
    """
    customer_id = account_data.customer_id.upper()
    branch      = account_data.branch.upper()       # e.g., "NORTH"
    db          = get_branch_db(branch)

    # REFERENTIAL INTEGRITY: customer must exist in global registry
    customers_db  = state.db_instances["customers"]
    customer_doc  = await customers_db.customers.find_one(
        {"_id": customer_id},
        {"_id": 1, "customer_name": 1},
    )
    if not customer_doc:
        raise HTTPException(
            status_code=404,
            detail=f"Customer '{customer_id}' not found. Register via POST /customers/ first.",
        )

    customer_name = customer_doc["customer_name"]
    account_number = f"ACC-{customer_id}-{branch}"   # globally unique per customer+branch

    # CONSISTENCY: one account per customer per branch (backed by unique index)
    existing = await db.accounts.find_one(
        {"account_number": account_number},
        {"_id": 1},
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"'{customer_id}' already has an account on the {branch} branch node.",
        )

    now = datetime.now(timezone.utc)
    new_account = {
        "account_number":    account_number,
        "account_title":     customer_name,     # denormalized from CustomerDB for fast reads
        "customer_id":       customer_id,
        "branch":            branch,
        "available_balance": to_d128(account_data.initial_balance),
        "locked_balance":    to_d128(0),
        "status":            "ACTIVE",
        "created_at":        now,
        "updated_at":        now,
    }

    result = await db.accounts.insert_one(new_account)
    new_account["_id"] = result.inserted_id
    return serialize_account(new_account)


@router.get(
    "/{branch}",
    response_model=list[AccountResponse],
    summary="List all accounts on a specific branch shard",
)
async def list_accounts(
    branch: str,
    status: Optional[str] = Query(None, description="Filter: ACTIVE | INACTIVE | FROZEN"),
    limit:  int = Query(100, ge=1, le=500),
):
    """
    DISTRIBUTIVE QUERY (single-node): Returns accounts for one branch shard.
    Uses idx_status and ACCOUNT_PROJECTION for query optimization.
    """
    db: object = get_branch_db(branch)
    query_filter: dict = {}
    if status:
        query_filter["status"] = status.upper()

    accounts = []
    async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(limit):
        accounts.append(serialize_account(doc))
    return accounts


@router.get(
    "/{branch}/{account_id}",
    response_model=AccountResponse,
    summary="Fetch a single account by branch and MongoDB ObjectId",
)
async def get_account(branch: str, account_id: str):
    """DISTRIBUTIVE QUERY: Direct lookup on the correct shard by primary key."""
    if not valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format (expected 24-char hex)")
    db  = get_branch_db(branch)
    doc = await db.accounts.find_one({"_id": ObjectId(account_id)}, ACCOUNT_PROJECTION)
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    return serialize_account(doc)


@router.patch(
    "/{branch}/{account_id}/status",
    summary="Update account status: ACTIVE | INACTIVE | FROZEN",
)
async def update_account_status(branch: str, account_id: str, new_status: str):
    """
    CONSISTENCY: Validates allowed status transitions before writing.
    Updates the account's status and bumps updated_at timestamp.
    """
    if not valid_oid(account_id):
        raise HTTPException(status_code=400, detail="Invalid account ID format")

    allowed    = {"ACTIVE", "INACTIVE", "FROZEN"}
    normalized = new_status.upper()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {sorted(allowed)}")

    db = get_branch_db(branch)
    result = await db.accounts.update_one(
        {"_id": ObjectId(account_id)},
        {"$set": {"status": normalized, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")

    return {"message": f"Account status updated to {normalized}", "new_status": normalized}
