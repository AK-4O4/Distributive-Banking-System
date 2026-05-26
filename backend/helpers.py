# helpers.py — Shared utilities for route handlers
# ─────────────────────────────────────────────────
# Contains: branch validation, document serializers, ObjectId validator.
# Imported by all route modules to avoid code duplication.

from bson import ObjectId
from fastapi import HTTPException
import state

BRANCH_NAMES = ["north", "south", "east", "west", "central"]


# ── Branch router ─────────────────────────────────────────────────────────────

def get_branch_db(branch_id: str):
    """
    Route a request to the correct physical shard.
    DISTRIBUTIVE TRANSACTION: validates branch name and returns its DB instance.
    """
    b = branch_id.lower()
    if b not in BRANCH_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid branch: '{branch_id}'. Must be one of {BRANCH_NAMES}",
        )
    return state.db_instances[b]


# ── ObjectId validator ────────────────────────────────────────────────────────

def valid_oid(value: str) -> bool:
    """Return True if value is a valid 24-char hex MongoDB ObjectId."""
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


# ── Document serializers ──────────────────────────────────────────────────────

def serialize_account(doc: dict) -> dict:
    """Convert a raw MongoDB account document to a JSON-serializable dict."""
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
    """Convert a raw MongoDB transaction document to a JSON-serializable dict."""
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
