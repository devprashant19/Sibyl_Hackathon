# Sibyl Python Quickstart

This example demonstrates how to integrate Sibyl into a standard FastAPI + Postgres application. We use the exact same bug class (Database TOCTOU) as the Node.js example, proving Sibyl's multi-language determinism!

## 1. The Application Bug
In `main.py`, we have an endpoint `POST /api/checkout`. 
It reads the inventory, verifies there is stock, and then writes the new stock. Because it doesn't wrap this in a transaction using `SELECT ... FOR UPDATE`, it is vulnerable to a race condition. 

## 2. Integration
Notice the very top of `main.py`:
```python
from sibyl import install
install()
```
That's it! Sibyl automatically monkey-patches `asyncpg`, `psycopg2`, `requests`, `httpx`, and the Python runtime's time module (`time.time`, `asyncio.sleep`).

## 3. The Promise
In `sibyl_config.py`, we use `@define_promise` to declare our invariant:
```python
@define_promise(id="no-negative-inventory", severity="CRITICAL")
def check_inventory(ctx):
    updates = ctx.timeline(lambda e: 'UPDATE products' in e.payload.get('query', ''))
    return not any(u.payload.get('args', [0])[0] < 0 for u in updates)
```

## 4. Running the Simulation
```bash
pip install -r requirements.txt
# (Assuming the sibyl orchestrator can call into python)
sibyl run --target sibyl_config.py --iterations 10 --local-only
```
Sibyl injects a `SLOW_IO` delay between the `SELECT` and `UPDATE`, predictably failing the test by causing negative inventory!
