from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncpg
import asyncio
from typing import Optional

# 1. Install Sibyl globally
from sibyl import install
install()

app = FastAPI()

class CheckoutRequest(BaseModel):
    product_id: int
    quantity: int

# Fake DB Pool
pool: Optional[asyncpg.Pool] = None

@app.on_event("startup")
async def startup():
    global pool
    # Connect to local test DB
    try:
        pool = await asyncpg.create_pool(user='postgres', password='password', database='quickstart', host='127.0.0.1')
    except Exception:
        print("Warning: Could not connect to Postgres. This is just an example.")

@app.post("/api/checkout")
async def checkout(req: CheckoutRequest):
    if not pool:
        return {"success": True, "remaining": 9} # Mock fallback

    async with pool.acquire() as conn:
        # THE BUG: TOCTOU Race Condition
        # 1. Read inventory
        inventory = await conn.fetchval('SELECT inventory FROM products WHERE id = $1', req.product_id)
        inventory = inventory or 0

        if inventory < req.quantity:
            raise HTTPException(status_code=400, detail="Out of stock")

        # 2. Write inventory (Vulnerable without FOR UPDATE)
        new_inventory = inventory - req.quantity
        await conn.execute('UPDATE products SET inventory = $1 WHERE id = $2', new_inventory, req.product_id)

        return {"success": True, "remaining": new_inventory}
