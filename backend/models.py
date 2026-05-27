from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, Literal
from datetime import datetime, timezone
from decimal import Decimal
import re

# ─── Enums & Literals ────────────────────────────────────────────────────────

BRANCHES = Literal["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"]
TX_STATES = Literal["INITIATED", "PREPARED", "COMMITTED", "ABORTED"]
ACCOUNT_STATUS = Literal["ACTIVE", "INACTIVE", "FROZEN"]
TX_TYPES = Literal["TRANSFER", "DEPOSIT", "WITHDRAWAL"]

def now_utc():
    return datetime.now(timezone.utc)

# ─── Input Models (API Payloads) ─────────────────────────────────────────────

class CustomerCreate(BaseModel):
    customer_id: str = Field(..., min_length=3, max_length=50)
    customer_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator("customer_id")
    @classmethod
    def validate_customer_id(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9_\-]+$", v):
            raise ValueError("customer_id may only contain letters, digits, hyphens, and underscores")
        return v.upper()

class AccountCreate(BaseModel):
    customer_id: str = Field(..., min_length=3, max_length=50)
    branch: BRANCHES
    initial_balance: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), decimal_places=2)

class TransferRequest(BaseModel):
    initiator_id: str = Field(...)
    source_branch: BRANCHES
    source_account_id: str = Field(..., min_length=24, max_length=24)
    target_branch: BRANCHES
    target_account_id: str = Field(..., min_length=24, max_length=24)
    amount: Decimal = Field(..., gt=Decimal("0.00"), le=Decimal("1000000.00"), decimal_places=2)
    idempotency_key: str = Field(..., min_length=10, max_length=100)

    @field_validator("source_account_id", "target_account_id")
    @classmethod
    def validate_hex_id(cls, v: str) -> str:
        if not re.match(r"^[0-9a-fA-F]{24}$", v):
            raise ValueError("Account ID must be exactly 24 hex characters")
        return v

class LoginRequest(BaseModel):
    customer_id: str = Field(..., min_length=3, max_length=50)
    password: str = Field(...)

# ─── Database & Response Models ──────────────────────────────────────────────

class CustomerDB(BaseModel):
    """Schema for the Global Customers Collection"""
    id: str = Field(alias="_id")
    customer_name: str
    password_hash: str
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    model_config = ConfigDict(populate_by_name=True)

class AccountDB(BaseModel):
    """Schema for the Branch Accounts Collection"""
    id: str = Field(alias="_id", description="MongoDB ObjectId")
    account_number: str = Field(..., description="Globally unique account number")
    account_title: str = Field(..., description="Format: ACC-CUST_ID-BRANCH")
    customer_id: str
    branch: BRANCHES
    available_balance: Decimal = Field(decimal_places=2)
    locked_balance: Decimal = Field(default=Decimal("0.00"), decimal_places=2)
    status: ACCOUNT_STATUS = Field(default="ACTIVE")
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    model_config = ConfigDict(populate_by_name=True)

class TransactionLogDB(BaseModel):
    """Schema for the Coordinator's Distributed Transaction Log"""
    id: str = Field(alias="_id", description="Global Transaction ID (e.g., TXN-...)")
    type: TX_TYPES
    initiator_id: str
    source_branch: Optional[BRANCHES] = None
    source_account_id: Optional[str] = None
    target_branch: Optional[BRANCHES] = None
    target_account_id: Optional[str] = None
    amount: Decimal = Field(decimal_places=2)
    state: TX_STATES = Field(default="INITIATED")
    idempotency_key: str
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    model_config = ConfigDict(populate_by_name=True)

# ─── API Query / Response Models ─────────────────────────────────────────────

class GlobalQueryRequest(BaseModel):
    """Fan-out query across all 5 branch nodes simultaneously."""
    customer_id: Optional[str] = Field(None, max_length=50)
    status:      Optional[ACCOUNT_STATUS] = None
    min_balance: Optional[Decimal] = Field(None, ge=Decimal("0.00"))

class AccountResponse(BaseModel):
    """JSON-safe account model returned by all endpoints (floats, not Decimal)."""
    id:                str
    account_number:    str
    account_title:     str
    customer_id:       str
    branch:            str
    available_balance: float
    locked_balance:    float
    status:            str
    created_at:        Optional[datetime] = None
    model_config = ConfigDict(populate_by_name=True)

class CustomerResponse(BaseModel):
    customer_id:   str
    customer_name: str
    created_at:    Optional[datetime] = None

class TransactionResponse(BaseModel):
    """JSON-safe transaction model returned by the ledger endpoint."""
    id:                str
    type:              str
    initiator_id:      str
    source_branch:     Optional[str] = None
    source_account_id: Optional[str] = None
    target_branch:     Optional[str] = None
    target_account_id: Optional[str] = None
    amount:            Optional[float] = None
    state:             str
    idempotency_key:   str
    error:             Optional[str] = None
    created_at:        Optional[datetime] = None
    updated_at:        Optional[datetime] = None