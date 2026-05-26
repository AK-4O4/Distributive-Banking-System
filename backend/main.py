"""
Distributive Banking System — FastAPI Coordinator
==================================================
Entry point for the coordinator service. Responsibilities:
  1. Connect to each physical MongoDB Atlas cluster on startup
  2. Map logical database instances (branches + ledger)
  3. Create query-optimization indexes across all nodes in parallel
  4. Run 2PC crash recovery for any incomplete transactions
  5. Register all route modules and configure CORS

Route modules (see routes/):
  health.py    — GET /        GET /health
  accounts.py  — POST/GET/PATCH /accounts/...
  queries.py   — POST /query/global   GET /query/customer/{id}
  transfers.py — POST /transfer/
  ledger.py    — GET /transactions/
"""

import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

import state
from database import ensure_indexes, ensure_ledger_indexes
from recovery import recover_incomplete_transactions
from routes import accounts, health, ledger, queries, transfers

load_dotenv()


# ── Lifespan — startup & shutdown ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Distributive Banking Coordinator…")

    # 1. Connect to each physical Atlas cluster
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
        state.db_clients[key] = AsyncIOMotorClient(uri)

    # 2. Map logical database names to connection objects
    state.db_instances["north"]   = state.db_clients["north"]["db_branch_north"]
    state.db_instances["south"]   = state.db_clients["south"]["db_branch_south"]
    state.db_instances["east"]    = state.db_clients["east"]["db_branch_east"]
    state.db_instances["west"]    = state.db_clients["west"]["db_branch_west"]
    state.db_instances["central"] = state.db_clients["coordinator"]["db_branch_central"]
    state.db_instances["ledger"]  = state.db_clients["coordinator"]["db_coordinator_ledger"]

    # 3. QUERY OPTIMIZATION: create indexes on all branch nodes in parallel
    print("Creating indexes…")
    await asyncio.gather(
        ensure_indexes(state.db_instances["north"],   "north"),
        ensure_indexes(state.db_instances["south"],   "south"),
        ensure_indexes(state.db_instances["east"],    "east"),
        ensure_indexes(state.db_instances["west"],    "west"),
        ensure_indexes(state.db_instances["central"], "central"),
        ensure_ledger_indexes(state.db_instances["ledger"]),
    )

    # 4. CONSISTENCY: recover any incomplete 2PC transactions from a previous crash
    await recover_incomplete_transactions()

    print("All connections, indexes, and recovery complete. Ready.")
    yield

    # Graceful shutdown — close all Atlas connections
    print("Shutting down…")
    for client in state.db_clients.values():
        client.close()
    print("All connections closed.")


# ── Application ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Distributive Banking Coordinator",
    description=(
        "Coordinator service for a horizontally-fragmented banking system. "
        "Implements distributed transactions, Two-Phase Commit, distributed "
        "fan-out queries, and query optimization across 5 MongoDB Atlas shards."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# SECURITY: restrict CORS to the known frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

# ── Route registration ────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(accounts.router)
app.include_router(queries.router)
app.include_router(transfers.router)
app.include_router(ledger.router)
