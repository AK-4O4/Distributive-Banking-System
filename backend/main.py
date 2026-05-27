"""
Distributive Banking System — FastAPI Coordinator  v3
======================================================
Entry point for the coordinator service. Responsibilities:
  1. Connect to each physical MongoDB Atlas cluster on startup
     (deduplicates Motor clients when multiple env vars share the same URI)
  2. Map logical database instances (branches + ledger + customers)
  3. Create query-optimization indexes across all nodes in parallel
  4. Run 2PC crash recovery for any incomplete transactions
  5. Seed the default admin user into admin_users collection if absent
  6. Register all route modules and configure CORS

Collections:
  db_branch_{north|south|east|west|central}.accounts   <- branch account shards
  db_coordinator_ledger.transaction_logs               <- 2PC coordinator log
  db_coordinator_ledger.admin_users                    <- admin credentials
  db_customers.customers                               <- global customer registry
"""

import asyncio
import hashlib
import os
import ssl
from contextlib import asynccontextmanager

import certifi
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

import state
from database import ensure_indexes, ensure_ledger_indexes, ensure_customer_indexes
from recovery import recover_incomplete_transactions
from routes import accounts, auth, customers, health, ledger, queries, transfers

load_dotenv()


# ── Lifespan — startup & shutdown ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Distributive Banking Coordinator v3...")

    # 1. Build connection map — deduplicate Motor clients by URI
    #    (critical for single-cluster demo: all 5 env vars may point to same Atlas cluster)
    uri_map: dict[str, AsyncIOMotorClient] = {}  # uri -> client (shared)

    for key, env_var in [
        ("north",       "MONGO_URI_NORTH"),
        ("south",       "MONGO_URI_SOUTH"),
        ("east",        "MONGO_URI_EAST"),
        ("west",        "MONGO_URI_WEST"),
        ("coordinator", "MONGO_URI_COORDINATOR"),
    ]:
        uri = os.getenv(env_var)
        if not uri:
            raise RuntimeError(f"Missing environment variable: {env_var}")
        if uri not in uri_map:
            # tlsCAFile fixes the "tlsv1 alert internal error" on Python 3.11 +
            # OpenSSL 3.0 when connecting to MongoDB Atlas over TLS.
            uri_map[uri] = AsyncIOMotorClient(
                uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=20000,
            )
        state.db_clients[key] = uri_map[uri]   # may be same object as another key

    # 2. Map logical database names to Motor database handles
    state.db_instances["north"]     = state.db_clients["north"]["db_branch_north"]
    state.db_instances["south"]     = state.db_clients["south"]["db_branch_south"]
    state.db_instances["east"]      = state.db_clients["east"]["db_branch_east"]
    state.db_instances["west"]      = state.db_clients["west"]["db_branch_west"]
    state.db_instances["central"]   = state.db_clients["coordinator"]["db_branch_central"]
    state.db_instances["ledger"]    = state.db_clients["coordinator"]["db_coordinator_ledger"]
    state.db_instances["customers"] = state.db_clients["coordinator"]["db_customers"]

    # 3. QUERY OPTIMIZATION: create indexes on all nodes in parallel
    # Each branch is independently wrapped — a slow/unreachable node won't block startup.
    print("Creating indexes...")
    async def _safe_ensure(coro, label: str):
        try:
            await asyncio.wait_for(coro, timeout=15.0)
        except asyncio.TimeoutError:
            print(f"  [!!] Index timeout for {label} — node may be unreachable. Continuing.")
        except Exception as exc:
            print(f"  [!!] Index error for {label}: {exc}. Continuing.")

    await asyncio.gather(
        _safe_ensure(ensure_indexes(state.db_instances["north"],     "NORTH"),     "NORTH"),
        _safe_ensure(ensure_indexes(state.db_instances["south"],     "SOUTH"),     "SOUTH"),
        _safe_ensure(ensure_indexes(state.db_instances["east"],      "EAST"),      "EAST"),
        _safe_ensure(ensure_indexes(state.db_instances["west"],      "WEST"),      "WEST"),
        _safe_ensure(ensure_indexes(state.db_instances["central"],   "CENTRAL"),   "CENTRAL"),
        _safe_ensure(ensure_ledger_indexes(state.db_instances["ledger"]),           "LEDGER"),
        _safe_ensure(ensure_customer_indexes(state.db_instances["customers"]),      "CUSTOMERS"),
    )

    # 4. CONSISTENCY: recover any incomplete 2PC transactions
    await recover_incomplete_transactions()

    # 5. Seed default admin user (admin / admin123) if the collection is empty
    ledger_db = state.db_instances["ledger"]
    if not await ledger_db.admin_users.find_one({"_id": "admin"}):
        await ledger_db.admin_users.insert_one({
            "_id":           "admin",
            "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
        })
        print("  [OK] Default admin user seeded (admin / admin123)")

    print("All connections, indexes, and recovery complete. Ready.")
    yield

    # Graceful shutdown — close unique Motor clients only
    print("Shutting down...")
    closed_clients: set[int] = set()
    for client in state.db_clients.values():
        cid = id(client)
        if cid not in closed_clients:
            client.close()
            closed_clients.add(cid)
    print("All connections closed.")


# ── Application ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Distributive Banking Coordinator",
    description=(
        "Coordinator service for a horizontally-fragmented banking system. "
        "Implements distributed transactions, Two-Phase Commit (2PC), distributed "
        "fan-out queries, and query optimization across 5 MongoDB Atlas shards."
    ),
    version="3.0.0",
    lifespan=lifespan,
)

# SECURITY: restrict CORS to the known frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# ── Route registration ────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(accounts.router)
app.include_router(queries.router)
app.include_router(transfers.router)
app.include_router(ledger.router)
