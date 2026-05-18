# models.py
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
import re

BRANCHES = Literal["north", "south", "east", "west", "central"]


# ─── Input Models ───────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    customer_id: str = Field(..., min_length=3, max_length=50, description="Global Customer ID, e.g., CUST-888")
    customer_name: str = Field(..., min_length=1, max_length=100)
    branch_id: BRANCHES = Field(..., description="Must be north, south, east, west, or central")
    initial_balance: float = Field(..., ge=0.0, description="Cannot open with negative balance")

    # SECURITY: sanitize inputs — reject SQL/NoSQL injection patterns
    @field_validator("customer_id")
    @classmethod
    def validate_customer_id(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9_\-]+$", v):
            raise ValueError("customer_id may only contain letters, digits, hyphens, and underscores")
        return v.upper()

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, v: str) -> str:
        # Strip control chars and HTML — no script injection
        cleaned = re.sub(r"[<>{}&\"']", "", v).strip()
        if not cleaned:
            raise ValueError("customer_name must not be empty after sanitization")
        return cleaned


class TransferRequest(BaseModel):
    initiator_id: str = Field(..., min_length=1, max_length=100)
    source_branch: BRANCHES
    source_account_id: str = Field(..., min_length=24, max_length=24, description="24-char hex MongoDB _id")
    target_branch: BRANCHES
    target_account_id: str = Field(..., min_length=24, max_length=24, description="24-char hex MongoDB _id")
    amount: float = Field(..., gt=0.0, le=1_000_000.0, description="Transfer amount: 0 < amount ≤ 1,000,000")
    idempotency_key: Optional[str] = Field(None, max_length=100, description="Optional client-supplied dedup key")

    @field_validator("source_account_id", "target_account_id")
    @classmethod
    def validate_hex_id(cls, v: str) -> str:
        if not re.match(r"^[0-9a-fA-F]{24}$", v):
            raise ValueError("Account ID must be exactly 24 hex characters")
        return v


class GlobalQueryRequest(BaseModel):
    """Fan-out query across all branches simultaneously."""
    customer_id: Optional[str] = Field(None, max_length=50)
    status: Optional[Literal["ACTIVE", "INACTIVE", "FROZEN"]] = None
    min_balance: Optional[float] = Field(None, ge=0.0)


# ─── Response Models ─────────────────────────────────────────────────────────

class AccountResponse(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    branch_id: str
    available_balance: float
    locked_balance: float
    status: str
    created_at: Optional[datetime] = None

    model_config = {"populate_by_name": True}


class TransactionLogEntry(BaseModel):
    id: str
    type: str
    source_branch: Optional[str] = None
    target_branch: Optional[str] = None
    amount: Optional[float] = None
    state: str
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    committed_at: Optional[datetime] = None
