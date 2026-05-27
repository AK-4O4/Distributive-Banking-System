# routes/customers.py — Global customer registry endpoints
# ---------------------------------------------------------
# Manages the globally-replicated customers collection stored in db_customers.
# This is separate from branch accounts — a customer must be registered here
# first before they can open an account on any branch node.

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from helpers import serialize_customer
from models import CustomerCreate, CustomerResponse
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/customers",
    tags=["Customers"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)

CUSTOMER_PROJECTION = {
    "_id": 1,
    "customer_name": 1,
    "created_at": 1,
}


@router.post(
    "/",
    response_model=CustomerResponse,
    summary="Register a new customer in the global customers collection",
)
async def register_customer(data: CustomerCreate):
    """
    GLOBAL WRITE: Inserts into db_customers.customers — the single source of truth
    for customer identity and authentication.

    The customer_id becomes the MongoDB _id (no ObjectId — it IS the identity).
    Password is stored as SHA-256 hash — never plaintext.

    A customer must register here BEFORE opening any branch account.
    """
    customers_db = state.db_instances["customers"]

    # Idempotency: if customer already exists, return their data
    existing = await customers_db.customers.find_one(
        {"_id": data.customer_id},
        CUSTOMER_PROJECTION,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Customer '{data.customer_id}' is already registered. Please log in.",
        )

    doc = {
        "_id":           data.customer_id,         # customer_id IS the primary key
        "customer_name": data.customer_name,
        "password_hash": hashlib.sha256(data.password.encode()).hexdigest(),
        "created_at":    datetime.now(timezone.utc),
        "updated_at":    datetime.now(timezone.utc),
    }
    await customers_db.customers.insert_one(doc)

    return {
        "customer_id":   data.customer_id,
        "customer_name": data.customer_name,
        "created_at":    doc["created_at"],
    }


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Fetch a customer record from the global registry",
)
async def get_customer(customer_id: str):
    """
    Direct lookup on db_customers.customers by primary key (customer_id).
    Strips sensitive fields (password_hash) before returning.
    """
    customers_db = state.db_instances["customers"]
    doc = await customers_db.customers.find_one(
        {"_id": customer_id.upper()},
        CUSTOMER_PROJECTION,
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"Customer '{customer_id}' not found")
    return serialize_customer(doc)
