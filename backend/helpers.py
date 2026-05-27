# helpers.py — Shared utilities for route handlers
# -------------------------------------------------
# Updated for v2 schema:
#   - BRANCH_NAMES now uppercase ("NORTH", ...) — matches BRANCHES literal
#   - Decimal128 converters for MongoDB NumberDecimal fields
#   - Updated serializers for AccountDB, CustomerDB, TransactionLogDB shapes

from bson import ObjectId, Decimal128
from decimal import Decimal
from fastapi import HTTPException
import state

# All branch names are stored uppercase in the DB and in request models
BRANCH_NAMES = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"]


# ── Branch router ─────────────────────────────────────────────────────────────

def get_branch_db(branch: str):
    """
    Route a request to the correct physical shard.
    Accepts uppercase branch name ("NORTH") and returns the Motor DB instance.
    """
    b = branch.upper()
    if b not in BRANCH_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid branch: '{branch}'. Must be one of {BRANCH_NAMES}",
        )
    return state.db_instances[b.lower()]


# ── ObjectId validator ────────────────────────────────────────────────────────

def valid_oid(value: str) -> bool:
    """Return True if value is a valid 24-char hex MongoDB ObjectId."""
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


# ── Decimal128 converters ─────────────────────────────────────────────────────

def to_d128(value) -> Decimal128:
    """Convert Python Decimal/float/int to MongoDB Decimal128 (2 dp)."""
    return Decimal128(str(Decimal(str(value)).quantize(Decimal("0.01"))))


def from_d128(value) -> float:
    """Convert MongoDB Decimal128 (or plain number) to Python float."""
    if isinstance(value, Decimal128):
        return float(value.to_decimal())
    if isinstance(value, Decimal):
        return float(value)
    return float(value) if value is not None else 0.0


# ── Document serializers ──────────────────────────────────────────────────────

def serialize_account(doc: dict) -> dict:
    """
    Convert a raw MongoDB AccountDB document to a JSON-serializable dict.
    Handles Decimal128 → float conversion for balance fields.
    """
    return {
        "id":                str(doc["_id"]),
        "account_number":    doc.get("account_number", ""),
        "account_title":     doc.get("account_title", ""),
        "customer_id":       doc.get("customer_id", ""),
        "branch":            doc.get("branch", ""),
        "available_balance": from_d128(doc.get("available_balance", 0)),
        "locked_balance":    from_d128(doc.get("locked_balance", 0)),
        "status":            doc.get("status", "ACTIVE"),
        "created_at":        doc.get("created_at"),
    }


def serialize_customer(doc: dict) -> dict:
    """Convert a raw MongoDB CustomerDB document (strips password_hash)."""
    return {
        "customer_id":   str(doc["_id"]),
        "customer_name": doc.get("customer_name", ""),
        "created_at":    doc.get("created_at"),
    }


def serialize_tx(doc: dict) -> dict:
    """
    Convert a raw MongoDB TransactionLogDB document to a JSON-serializable dict.
    Handles Decimal128 → float for the amount field.
    """
    raw_amount = doc.get("amount")
    return {
        "id":                str(doc["_id"]),
        "type":              doc.get("type", "TRANSFER"),
        "initiator_id":      doc.get("initiator_id", ""),
        "source_branch":     doc.get("source_branch"),
        "source_account_id": doc.get("source_account_id"),
        "target_branch":     doc.get("target_branch"),
        "target_account_id": doc.get("target_account_id"),
        "amount":            from_d128(raw_amount) if raw_amount is not None else None,
        "state":             doc.get("state", "INITIATED"),
        "idempotency_key":   doc.get("idempotency_key", ""),
        "error":             doc.get("error"),
        "created_at":        doc.get("created_at"),
        "updated_at":        doc.get("updated_at"),
    }
