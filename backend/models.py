# models.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

# Model for creating a new account
class AccountCreate(BaseModel):
    customer_id: str = Field(..., description="Global Customer ID, e.g., CUST-888")
    customer_name: str
    branch_id: str = Field(..., description="Must be north, south, east, west, or central")
    initial_balance: float = Field(..., ge=0.0, description="Cannot open an account with negative balance")

# Model for the 2PC Transfer Request
class TransferRequest(BaseModel):
    initiator_id: str
    source_branch: str
    source_account_id: str
    target_branch: str
    target_account_id: str
    amount: float = Field(..., gt=0.0, description="Transfer amount must be strictly greater than zero")

# Standardized Account Response
class AccountResponse(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    branch_id: str
    available_balance: float
    locked_balance: float
    status: str