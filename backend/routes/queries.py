# routes/queries.py — Distributed query endpoints
# ------------------------------------------------
# Fan-out queries that run against all branch nodes simultaneously
# using asyncio.gather, then merge results at the coordinator level.
# Updated for v2 schema: branch field (uppercase), Decimal128 balances.

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
    merges and returns a unified response.

    QUERY OPTIMIZATION:
      - min_balance uses idx_balance_desc (range query on available_balance)
      - status uses idx_status
      - customer_id uses idx_customer_id
    """
    query_filter: dict = {}
    if req.customer_id:
        query_filter["customer_id"] = req.customer_id.strip().upper()
    if req.status:
        query_filter["status"] = req.status
    if req.min_balance is not None:
        from helpers import to_d128
        query_filter["available_balance"] = {"$gte": to_d128(req.min_balance)}

    active_filters = {k: (str(v) if not isinstance(v, str) else v)
                      for k, v in query_filter.items() if not isinstance(v, dict)}

    async def query_branch(branch_name: str) -> tuple[str, list, str | None]:
        db = state.db_instances[branch_name.lower()]
        results = []
        error   = None
        try:
            async for doc in db.accounts.find(query_filter, ACCOUNT_PROJECTION).limit(200):
                results.append(doc)
        except Exception as exc:
            error = str(exc)
        return branch_name, results, error

    raw = await asyncio.gather(*[query_branch(b) for b in BRANCH_NAMES])

    all_accounts:   list  = []
    branch_errors:  dict  = {}
    branches_queried: list = []

    for branch_name, docs, err in raw:
        branches_queried.append(branch_name)
        if err:
            branch_errors[branch_name] = err
        else:
            all_accounts.extend([serialize_account(d) for d in docs])

    return {
        "total_results":    len(all_accounts),
        "branches_queried": branches_queried,
        "branch_errors":    branch_errors,
        "accounts":         all_accounts,
        "query_filter":     active_filters,
    }


@router.get(
    "/customer/{customer_id}",
    summary="Find all accounts for a customer across ALL branch nodes",
)
async def find_customer_accounts(customer_id: str):
    """
    DISTRIBUTIVE QUERY — Cross-branch customer lookup.

    Queries all 5 branch shards in parallel for the given customer_id.
    Uses idx_customer_id index on each shard for O(log n) performance.
    Also fetches customer metadata from the global customers collection.
    """
    cid          = customer_id.strip().upper()
    customers_db = state.db_instances["customers"]

    # Fetch customer metadata from global registry (optional — may not exist for legacy data)
    customer_doc  = await customers_db.customers.find_one(
        {"_id": cid},
        {"_id": 1, "customer_name": 1},
    )
    customer_name = customer_doc["customer_name"] if customer_doc else cid

    async def search_branch(branch_name: str) -> list[dict]:
        db = state.db_instances[branch_name.lower()]
        results = []
        async for doc in db.accounts.find({"customer_id": cid}, ACCOUNT_PROJECTION):
            results.append(doc)
        return results

    branch_results = await asyncio.gather(*[search_branch(b) for b in BRANCH_NAMES])
    all_accounts   = [serialize_account(d) for sublist in branch_results for d in sublist]

    return {
        "customer_id":    cid,
        "customer_name":  customer_name,
        "total_accounts": len(all_accounts),
        "accounts":       all_accounts,
    }
