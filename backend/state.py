# state.py — Shared database connection state
# ─────────────────────────────────────────────
# Holds live AsyncIOMotorClient and database instances created during
# app startup (lifespan). All route modules import from here so the
# coordinator never has to pass DB objects as function parameters.

db_clients: dict = {}   # key → AsyncIOMotorClient
db_instances: dict = {} # key → AsyncIOMotorDatabase
