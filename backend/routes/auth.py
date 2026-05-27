# routes/auth.py — Authentication endpoints
# ------------------------------------------
# POST /auth/login  -> customer login (checks db_customers.customers)
# POST /auth/admin  -> admin login    (checks db_coordinator_ledger.admin_users)

import asyncio
import hashlib
from fastapi import APIRouter, Depends, HTTPException

from database import ACCOUNT_PROJECTION
from helpers import serialize_account, BRANCH_NAMES
from models import LoginRequest
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@router.post("/login", summary="Customer portal login — validates credentials against global customers collection")
async def login(req: LoginRequest):
    """
    AUTHENTICATION FLOW
    -------------------
    1. Normalize customer_id to uppercase.
    2. Look up customer in db_customers.customers by _id (primary key lookup — O(1)).
    3. Compare password safely (handles both seeded plain-text and SHA-256 hashes).
    4. Fan-out: query all 5 branch shards in parallel for this customer's accounts.
    5. Return customer info + all accounts across all branches.
    """
    customer_id   = req.customer_id.strip().upper()
    customers_db  = state.db_instances["customers"]

    # Request both password and password_hash in the projection
    customer_doc = await customers_db.customers.find_one(
        {"_id": customer_id},
        {"_id": 1, "customer_name": 1, "password_hash": 1, "password": 1},
    )
    
    if not customer_doc:
        raise HTTPException(
            status_code=401,
            detail="Invalid Customer ID or password.",
        )

    # Safely extract whatever format the database is currently storing
    stored_hash = customer_doc.get("password_hash")
    stored_plain = customer_doc.get("password")
    
    incoming_hash = _hash(req.password)
    is_valid = False

    # Check if the incoming password matches either the raw string or the SHA-256 hash
    if stored_hash:
        if stored_hash == incoming_hash or stored_hash == req.password:
            is_valid = True
    elif stored_plain:
        if stored_plain == incoming_hash or stored_plain == req.password:
            is_valid = True

    if not is_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid Customer ID or password.",
        )

    # Fan-out: gather all accounts for this customer across all 5 branch shards
    async def search_branch(branch_name: str) -> list[dict]:
        db = state.db_instances[branch_name.lower()]
        results = []
        async for doc in db.accounts.find(
            {"customer_id": customer_id},
            ACCOUNT_PROJECTION,
        ):
            results.append(doc)
        return results

    branch_results = await asyncio.gather(*[search_branch(b) for b in BRANCH_NAMES])
    all_docs = [doc for sublist in branch_results for doc in sublist]
    accounts = [serialize_account(doc) for doc in all_docs]

    return {
        "customer_id":    customer_id,
        "customer_name":  customer_doc.get("customer_name", customer_id),
        "total_accounts": len(accounts),
        "accounts":       accounts,
    }


@router.post("/admin", summary="Administrator login — checks admin_users collection")
async def admin_login(admin_id: str, password: str):
    """
    Admin authentication against the db_coordinator_ledger.admin_users collection.
    Returns a simple success flag — the frontend treats this as an admin session.

    admin_users schema: { _id: admin_id, password_hash: str }
    """
    ledger_db = state.db_instances["ledger"]
    doc = await ledger_db.admin_users.find_one({"_id": admin_id})

    if not doc or doc.get("password_hash") != _hash(password):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")

    return {"admin_id": admin_id, "is_admin": True}
