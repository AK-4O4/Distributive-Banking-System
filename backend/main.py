import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from bson import ObjectId

# Import the Pydantic models you defined in models.py
from models import AccountCreate, AccountResponse, TransferRequest

# Load the environment variables from the .env file
load_dotenv()

# Global dictionaries to hold our active database connections
db_clients = {}
db_instances = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP LOGIC ---
    print("Starting up Distributive Banking Coordinator...")
    
    # 1. Initialize the clients (The physical connections to Atlas)
    db_clients["north"] = AsyncIOMotorClient(os.getenv("MONGO_URI_NORTH"))
    db_clients["south"] = AsyncIOMotorClient(os.getenv("MONGO_URI_SOUTH"))
    db_clients["east"] = AsyncIOMotorClient(os.getenv("MONGO_URI_EAST"))
    db_clients["west"] = AsyncIOMotorClient(os.getenv("MONGO_URI_WEST"))
    db_clients["coordinator"] = AsyncIOMotorClient(os.getenv("MONGO_URI_COORDINATOR"))

    # 2. Map to the specific databases (The logical separation)
    db_instances["north"] = db_clients["north"]["db_branch_north"]
    db_instances["south"] = db_clients["south"]["db_branch_south"]
    db_instances["east"] = db_clients["east"]["db_branch_east"]
    db_instances["west"] = db_clients["west"]["db_branch_west"]
    
    # Central acts as both the Central Branch AND the Coordinator Ledger
    db_instances["central"] = db_clients["coordinator"]["db_branch_central"]
    db_instances["ledger"] = db_clients["coordinator"]["db_coordinator_ledger"]

    print("All 5 branch connections and 1 ledger connection established.")
    
    yield # The app runs here
    
    # --- SHUTDOWN LOGIC ---
    print("Shutting down connections...")
    for client in db_clients.values():
        client.close()
    print("Connections safely closed.")

# Initialize FastAPI
app = FastAPI(title="Advanced DBMS Coordinator", lifespan=lifespan)

# A simple health check route
@app.get("/")
async def root():
    return {"message": "Distributive Banking Coordinator is live."}

# --- THE FRAGMENTATION ROUTER ---
def get_branch_db(branch_id: str):
    """
    This is the core of our proactive horizontal fragmentation.
    It routes the query to the correct physical Atlas cluster based on the branch_id.
    """
    branch_id = branch_id.lower()
    if branch_id not in ["north", "south", "east", "west", "central"]:
        raise HTTPException(status_code=400, detail=f"Invalid branch ID: {branch_id}")
    
    # Return the specific MongoDB database object mapped during lifespan
    return db_instances[branch_id]

@app.post("/accounts/", response_model=AccountResponse)
async def create_account(account_data: AccountCreate):
    # 1. Route to the correct database
    db = get_branch_db(account_data.branch_id)
    
    # 2. Prepare the document state
    new_account = {
        "customer_id": account_data.customer_id,
        "customer_name": account_data.customer_name,
        "branch_id": account_data.branch_id.lower(),
        "available_balance": account_data.initial_balance,
        "locked_balance": 0.00,
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc)
    }
    
    # 3. Insert into the specific branch's collection
    result = await db.accounts.insert_one(new_account)
    
    # 4. Return the newly created account with its Mongo _id
    new_account["id"] = str(result.inserted_id)
    return new_account

# --- THE TWO-PHASE COMMIT ENGINE ---

@app.post("/transfer/")
async def process_transfer(req: TransferRequest):
    # 1. Establish the routing for this specific transaction
    ledger_db = db_instances["ledger"]
    source_db = get_branch_db(req.source_branch)
    target_db = get_branch_db(req.target_branch)

    # Step 1: Create PENDING transaction in Coordinator Ledger
    tx_doc = {
        "type": "CROSS_BRANCH_TRANSFER",
        "source_branch": req.source_branch,
        "target_branch": req.target_branch,
        "amount": req.amount,
        "state": "PENDING",
        "created_at": datetime.now(timezone.utc)
    }
    tx_result = await ledger_db.global_transactions.insert_one(tx_doc)
    tx_id = tx_result.inserted_id

    # Step 2: PREPARE Phase
    try:
        # Mark ledger as preparing
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id}, {"$set": {"state": "PREPARED"}}
        )

        # Attempt to lock funds at the source branch
        # This atomic query ensures the balance doesn't drop below 0 concurrently
        source_update = await source_db.accounts.update_one(
            {
                "_id": ObjectId(req.source_account_id), 
                "available_balance": {"$gte": req.amount}
            },
            {
                "$inc": {"available_balance": -req.amount, "locked_balance": req.amount}
            }
        )
        if source_update.modified_count == 0:
            raise Exception("Insufficient funds or source account not found.")

        # Verify target account exists before committing
        target_account = await target_db.accounts.find_one({"_id": ObjectId(req.target_account_id)})
        if not target_account:
            raise Exception("Target account not found.")

    except Exception as e:
        # Step 2b: ROLLBACK Phase (If Prepare fails)
        await ledger_db.global_transactions.update_one(
            {"_id": tx_id}, {"$set": {"state": "ABORTED", "error": str(e)}}
        )
        
        # If funds were locked, unlock them
        if 'source_update' in locals() and source_update.modified_count > 0:
            await source_db.accounts.update_one(
                {"_id": ObjectId(req.source_account_id)},
                {"$inc": {"available_balance": req.amount, "locked_balance": -req.amount}}
            )
        raise HTTPException(status_code=400, detail=f"Transfer aborted: {str(e)}")

    # Step 3: COMMIT Phase
    # Permanently remove locked funds from the source branch
    await source_db.accounts.update_one(
        {"_id": ObjectId(req.source_account_id)},
        {"$inc": {"locked_balance": -req.amount}}
    )
    
    # Add available funds to the target branch
    await target_db.accounts.update_one(
        {"_id": ObjectId(req.target_account_id)},
        {"$inc": {"available_balance": req.amount}}
    )

    # Finalize the ledger
    await ledger_db.global_transactions.update_one(
        {"_id": tx_id}, {"$set": {"state": "COMMITTED"}}
    )

    return {
        "message": "Transfer successful across distributed nodes.", 
        "transaction_id": str(tx_id)
    }