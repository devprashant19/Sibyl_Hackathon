from sibyl import define_promise
import httpx
import asyncio
from main import app

@define_promise(
    id="no-negative-inventory",
    description="Inventory must never drop below 0 due to concurrent sales",
    severity="CRITICAL"
)
def check_inventory(ctx):
    # Find all PG Queries where we UPDATE the inventory
    updates = ctx.timeline(lambda e: e.domain == 'DB' and 'UPDATE products SET inventory' in e.payload.get('query', ''))
    
    # If any of the updates set inventory to a negative number, we fail the promise.
    for u in updates:
        # asyncpg passes arguments as args tuple
        new_inventory = u.payload.get('args', [0])[0]
        if new_inventory < 0:
            return False
    return True


# Note: In the real CLI, this is declarative
# export const templates = [...]
templates = [
    {
        "id": "delay-postgres-write",
        "spec": { "domain": "DB", "type": "SLOW_IO" },
        "probabilityRange": [1.0, 1.0], # Force it to happen for the demo
        "delayMsRange": [100, 300],
        "target": { "query": "UPDATE products" }
    }
]

async def workflow():
    # Simulate two users trying to buy the same product at the exact same time
    async with httpx.AsyncClient() as client:
        # Fire both requests concurrently
        await asyncio.gather(
            client.post('http://localhost:8000/api/checkout', json={"product_id": 1, "quantity": 1}),
            client.post('http://localhost:8000/api/checkout', json={"product_id": 1, "quantity": 1})
        )
