"""
seed.py -- Populate test data for the v3 Distributive Banking System
=====================================================================
New schema:
  - db_customers.customers          <- global customer registry
  - db_branch_{BRANCH}.accounts     <- branch account shards
  - db_coordinator_ledger.transaction_logs <- 2PC log

Seed flow:
  1. Register 6 customers in POST /customers/
  2. Open accounts across branches via POST /accounts/
  3. Execute a cross-branch 2PC transfer
  4. Run a fan-out global query
  5. Print login credentials
"""

import sys
import requests

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE  = "http://127.0.0.1:8000"
HDRS  = {"X-API-Key": "dev-secret-key-change-in-production", "Content-Type": "application/json"}
PASS  = "Test@123!"   # satisfies min 8 chars

def post(path, body): return requests.post(BASE + path, json=body, headers=HDRS, timeout=10)
def get(path):        return requests.get(BASE + path, headers=HDRS, timeout=10)

def sep(title):
    print(f"\n{'-'*60}")
    print(f"  {title}")
    print(f"{'-'*60}")


# ── 1. Register customers ───────────────────────────────────────────────────
sep("Step 1: Register Customers in Global Registry")

CUSTOMERS = [
    {"customer_id": "CUST-001", "customer_name": "Alice Johnson",  "password": PASS},
    {"customer_id": "CUST-002", "customer_name": "Bob Rahman",     "password": PASS},
    {"customer_id": "CUST-003", "customer_name": "Carol Patel",    "password": PASS},
    {"customer_id": "CUST-004", "customer_name": "Dave Nguyen",    "password": PASS},
    {"customer_id": "CUST-005", "customer_name": "Eve Malik",      "password": PASS},
    {"customer_id": "CUST-ADM", "customer_name": "Admin Tester",   "password": PASS},
]

for c in CUSTOMERS:
    r = post("/customers/", c)
    if r.status_code == 200:
        print(f"  [REG]  {c['customer_name']:20s}  (ID: {c['customer_id']})")
    elif r.status_code == 409:
        print(f"  [SKIP] {c['customer_name']:20s}  already registered")
    else:
        print(f"  [ERR]  {c['customer_name']:20s}  -> {r.status_code}: {r.text[:100]}")


# ── 2. Open accounts across branches ────────────────────────────────────────
sep("Step 2: Open Branch Accounts")

ACCOUNTS = [
    # Alice -- North + Central
    {"customer_id": "CUST-001", "branch": "NORTH",   "initial_balance": 12500.00},
    {"customer_id": "CUST-001", "branch": "CENTRAL", "initial_balance":  3000.00},
    # Bob -- South
    {"customer_id": "CUST-002", "branch": "SOUTH",   "initial_balance":  8750.50},
    # Carol -- East + West
    {"customer_id": "CUST-003", "branch": "EAST",    "initial_balance": 22100.00},
    {"customer_id": "CUST-003", "branch": "WEST",    "initial_balance":  5000.00},
    # Dave -- Central
    {"customer_id": "CUST-004", "branch": "CENTRAL", "initial_balance":    500.00},
    # Eve -- North
    {"customer_id": "CUST-005", "branch": "NORTH",   "initial_balance":  9999.99},
    # Admin tester -- South
    {"customer_id": "CUST-ADM", "branch": "SOUTH",   "initial_balance":  1000.00},
]

created = {}   # customer_id -> account_id (for one of their accounts)

for a in ACCOUNTS:
    r = post("/accounts/", a)
    key = f"{a['customer_id']}@{a['branch']}"
    if r.status_code == 200:
        acc = r.json()
        created[key] = acc["id"]
        print(f"  [OK]  {acc['account_number']:30s}  ${a['initial_balance']:>11,.2f}")
    elif r.status_code == 409:
        # Already exists -- fetch the existing ID via fan-out query
        qr = post("/query/global", {"customer_id": a["customer_id"], "status": "ACTIVE"})
        if qr.status_code == 200:
            matches = [x for x in qr.json()["accounts"] if x["branch"] == a["branch"]]
            if matches:
                created[key] = matches[0]["id"]
                print(f"  [--]  ACC-{a['customer_id']}-{a['branch']:10s}  already exists")
    else:
        print(f"  [ERR] {key}  -> {r.status_code}: {r.text[:100]}")


# ── 3. 2PC transfer: Alice (NORTH) -> Bob (SOUTH) ───────────────────────────
sep("Step 3: 2PC Transfer -- Alice NORTH -> Bob SOUTH  $300.00")

src_id = created.get("CUST-001@NORTH")
tgt_id = created.get("CUST-002@SOUTH")

if src_id and tgt_id:
    r = post("/transfer/", {
        "initiator_id":      "seed_script_v3",
        "source_branch":     "NORTH",
        "source_account_id": src_id,
        "target_branch":     "SOUTH",
        "target_account_id": tgt_id,
        "amount":            "300.00",
        "idempotency_key":   f"SEED-V3-ALICE-BOB-001",
    })
    if r.status_code == 200:
        d = r.json()
        print(f"  [OK]  TX ID:  {d['transaction_id']}")
        print(f"        Phase:  {d['phase']}")
        print(f"        Amount: ${d['amount']:.2f}")
    else:
        print(f"  [ERR] {r.status_code}: {r.text[:200]}")
else:
    print(f"  [!!]  Skipped -- accounts not available (src={src_id}, tgt={tgt_id})")


# ── 4. Fan-out global query ─────────────────────────────────────────────────
sep("Step 4: Fan-out Query -- All ACTIVE accounts >= $1,000")

r = post("/query/global", {"status": "ACTIVE", "min_balance": 1000})
if r.status_code == 200:
    d = r.json()
    print(f"  Found {d['total_results']} accounts across {len(d['branches_queried'])} branches")
    for acc in d["accounts"][:8]:
        print(f"  * {acc['account_number']:35s}  ${acc['available_balance']:>11,.2f}")
    if d["total_results"] > 8:
        print(f"  ... and {d['total_results'] - 8} more")
else:
    print(f"  [ERR] {r.status_code}: {r.text[:200]}")


# ── 5. Summary ──────────────────────────────────────────────────────────────
sep("Done -- Login Credentials")
print(f"  Password for all accounts: {PASS}")
print()
for c in CUSTOMERS:
    print(f"  {c['customer_id']:12s}  {c['customer_name']}")
print()
print("  Admin login: admin / admin123 (top-right button on login page)")
print()
