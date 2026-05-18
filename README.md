# Distributive Banking System

A distributed database management system built with **MongoDB Atlas**, **FastAPI**, and **React + Vite** that demonstrates all core distributed systems principles:

| Principle | Implementation |
|---|---|
| Distributive Transaction | Every write is routed to the correct physical shard via the fragmentation router |
| Consistency | Unique constraints, status guards, atomic balance locking, no negative balances |
| Security | API key auth (`X-API-Key`), rate limiting, input sanitization, CORS restriction |
| Distributive Query | Fan-out across all 5 nodes via `asyncio.gather` with result merging at coordinator |
| Two-Phase Commit (2PC) | PENDING → PREPARED → COMMITTED/ABORTED with crash recovery on startup |
| Query Optimization | Background indexes on startup, field projections, compound indexes |

---

## Architecture

```
React Frontend  (port 5173)
       │  X-API-Key on every request
       ▼
FastAPI Coordinator  (port 8000)
       │
       ├── Fragmentation Router → routes by branch_id
       │
  ┌────┼──────────────────────────────┐
  │    │                              │
North South East West Central  ←  Ledger DB
  DB   DB   DB   DB    DB         (coordinator_ledger)
  └─────────────────────────────────┘
     5 physical MongoDB Atlas clusters
     (or 1 cluster with 5 databases for local dev)
```

Each branch is a separate Atlas cluster with its own `accounts` collection.
The `COORDINATOR` cluster hosts **both** the `central` branch DB and the `coordinator_ledger` DB.

---

## Setup

### Prerequisites

- Python 3.10+
- [Bun](https://bun.sh/) (used instead of npm)
- 5 MongoDB Atlas clusters (or 1 cluster — point all URIs to it for local dev)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in your Atlas URIs and set a strong API_KEY in .env

pip install -r requirements.txt
uvicorn main:app --reload
```

API starts at `http://127.0.0.1:8000`
Interactive docs at `http://127.0.0.1:8000/docs`

### 2. Frontend

```bash
cd frontend
bun install
bun run dev
```

App starts at `http://localhost:5173`

---

## Environment Variables (`backend/.env`)

```env
MONGO_URI_NORTH=mongodb+srv://...
MONGO_URI_SOUTH=mongodb+srv://...
MONGO_URI_EAST=mongodb+srv://...
MONGO_URI_WEST=mongodb+srv://...
MONGO_URI_COORDINATOR=mongodb+srv://...

API_KEY=dev-secret-key-change-in-production
```

> **Local dev tip:** Point all 5 URIs to the same cluster. Motor will use different database names (`db_branch_north`, `db_branch_south`, etc.) so they stay isolated.

---

## API Reference

All endpoints (except `GET /` and `GET /health`) require the `X-API-Key` header.

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Basic health check |
| GET | `/health` | Ping each branch node, return per-node status |

### Accounts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/accounts/` | Create account on a branch node |
| GET | `/accounts/{branch_id}` | List accounts on a branch (optional `?status=ACTIVE`) |
| GET | `/accounts/{branch_id}/{account_id}` | Get a single account |
| PATCH | `/accounts/{branch_id}/{account_id}/status` | Update account status |

### Distributed Query
| Method | Path | Description |
|--------|------|-------------|
| POST | `/query/global` | Fan-out query across all 5 nodes simultaneously |
| GET | `/query/customer/{customer_id}` | Find all accounts for a customer across all nodes |

### Transfer (2PC)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/transfer/` | Execute atomic cross-branch transfer via Two-Phase Commit |

### Ledger
| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions/` | Query the global coordinator ledger (optional `?state=COMMITTED`) |

---

## How Each Requirement Is Implemented

### Distributive Transaction
The `get_branch_db()` fragmentation router inspects `branch_id` on every request and returns the corresponding physical `AsyncIOMotorDatabase` instance. Writes never touch the wrong cluster.

### Consistency
- **Unique accounts**: `find_one({ customer_id, branch_id })` before insert — raises `409` on duplicate
- **Status enforcement**: transfers reject INACTIVE/FROZEN source or target accounts
- **Atomic balance lock**: the PREPARE phase uses a single `update_one` with `{ $gte: amount }` filter — if the filter fails, no funds move
- **No negative balance**: enforced by the atomic filter, not application logic
- **Idempotency**: transfers accept an optional `idempotency_key`; re-submitting the same key returns the existing committed result

### Security
- **`X-API-Key` header** required on all write/read endpoints; hashed comparison (SHA-256)
- **Rate limiting**: sliding-window, 60 requests/minute per IP (in-memory; use Redis in production)
- **Input sanitization**: Pydantic validators strip HTML/script characters from `customer_name`, enforce alphanumeric-only `customer_id`, hex-only account IDs
- **CORS**: restricted to `localhost:5173` only
- **Amount cap**: transfers capped at $1,000,000 per request

### Distributive Query
`POST /query/global` and `GET /query/customer/{id}` use `asyncio.gather()` to fire the same MongoDB query against all 5 branch databases in parallel. The coordinator merges results before returning. The frontend shows the round-trip time to illustrate the parallel speedup.

### Two-Phase Commit
```
Client → POST /transfer/
  │
  ├─ Phase 0: Insert PENDING record in ledger
  ├─ Phase 1 (PREPARE):
  │    ├─ Ledger → PREPARED
  │    ├─ Lock funds at source (atomic update_one with $gte guard)
  │    └─ Verify target account exists and is ACTIVE
  │
  ├─ Phase 2a (COMMIT) — if PREPARE succeeded:
  │    ├─ Release lock at source (decrement locked_balance)
  │    ├─ Credit target (increment available_balance)  ← parallel gather
  │    └─ Ledger → COMMITTED
  │
  └─ Phase 2b (ABORT) — if PREPARE failed:
       ├─ Compensate: unlock source funds if they were locked
       └─ Ledger → ABORTED
```
**Crash recovery**: on startup, the coordinator scans for transactions stuck in PENDING/PREPARED older than 5 minutes and aborts them with compensation.

### Query Optimization
On startup, `ensure_indexes()` creates background indexes on every branch:

| Index | Purpose |
|-------|---------|
| `customer_id ASC` | Fast customer lookup |
| `status ASC` | Fast status filter |
| `(branch_id, customer_id) compound` | Covers fragmented queries |
| `available_balance DESC` | Range queries in PREPARE check |

All reads use **field projections** (`ACCOUNT_PROJECTION`, `TRANSFER_PROJECTION`) — MongoDB never transfers fields the application doesn't need.

---

## Frontend Tabs

| Tab | What it shows |
|-----|--------------|
| Node Management | Create accounts; shows new account ID after creation |
| 2PC Transfer | Execute transfers; shows live PENDING→PREPARED→COMMITTED phase indicator |
| Distributed Query | Fan-out search across all nodes with elapsed time |
| TX Ledger | Full coordinator ledger with state filter and auto-refresh |

The **Node Connectivity** panel at the top pings each branch on load and shows live OK/ERR status.
