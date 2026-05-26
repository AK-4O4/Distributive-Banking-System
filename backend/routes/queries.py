# routes/queries.py — Distributed query endpoints
# ─────────────────────────────────────────────────
# Implements fan-out queries that run against all branch nodes simultaneously
# using asyncio.gather, then merge the results at the coordinator level.

import asyncio
from fastapi import APIRouter, Depends

from database import ACCOUNT_PROJECTION
from helpers import serialize_account, BRANCH_NAMES
from models import GlobalQueryRequest
from security import rate_limit, require_api_key
import state

router = APIRouter(
    prefix="/query",
    tags=["Distributed Query"],
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)


@router.post(
    "/global",
    summary="Fan-out query across ALL 5 branch nodes simultaneously",
)
async def global_query(req: GlobalQueryRequest):
    """
    DISTRIBUTIVE QUERY — Horizontal distribution pattern.

    Sends the same filter to all 5 branch shards in parallel via asyncio.gather.
    Each node applies the filter using its local indexes, then the coordinator
    merges the results and returns a single unified response.

    QUERY OPTIMIZATION: Uses idx_customer_id, idx_status, and idx_balance_desc
    indexes on each shard depending on which filters are active.
    """
    query_filter: dict = {}
    if req.customer_id:
        query_filter["customer_id"] = req.customer_id.upper()
    if req.status:
        query_filter["status"] = req.status
    if req.min_balance is not None:
        query_filter["available_balance"] = {"$gte": req.min_balance}

    async def query_branch(branch_name: str) -> list[dict]:
        db = state.db_instances[branch_name]
        results = []
        async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(200):
            results.append(serialize_account(doc))
        return results

    # Fan-out: all branches queried simultaneously
    branch_results = await asyncio.gather(
        *[query_branch(b) for b in BRANCH_NAMES],
        return_exceptions=True,
    )

    merged, errors = [], {}
    for branch_name, result in zip(BRANCH_NAMES, branch_results):
        if isinstance(result, Exception):
            errors[branch_name] = str(result)
        else:
            merged.extend(result)

    return {
        "total_results":    len(merged),
        "branches_queried": BRANCH_NAMES,
        "branch_errors":    errors,
        "accounts":         merged,
        "query_filter":     query_filter,
    }


@router.get(
    "/customer/{customer_id}",
    summary="Find all accounts for a customer across every branch",
)
async def find_customer_across_branches(customer_id: str):
    """
    DISTRIBUTIVE QUERY — Customer account aggregation.

    Locates a customer's accounts across all 5 branch shards in parallel.
    A customer may hold accounts at multiple branches simultaneously.

    QUERY OPTIMIZATION: Uses idx_customer_id index on every shard.
    """
    customer_id = customer_id.upper()

    async def search_branch(branch_name: str) -> list[dict]:
        db = state.db_instances[branch_name]
        results = []
        async for doc in db.accounts.find({"customer_id": customer_id}, ACCOUNT_PROJECTION):
            results.append(serialize_account(doc))
        return results

    branch_results = await asyncio.gather(*[search_branch(b) for b in BRANCH_NAMES])
    accounts = [acct for sublist in branch_results for acct in sublist]

    return {
        "customer_id":    customer_id,
        "total_accounts": len(accounts),
        "accounts":       accounts,
    }
