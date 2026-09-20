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
This installs (currently pass-through) hooks on `asyncpg`, `psycopg2`, `requests` and `httpx`. The clock is not patched globally; wrap simulated code in `with sibyl.VirtualClock():` if it needs virtual time.

## 3. The Promise
In `sibyl_config.py`, we use `@define_promise` to declare our invariant:
```python
@define_promise(id="no-negative-inventory", severity="CRITICAL")
def check_inventory(ctx):
    updates = ctx.timeline(lambda e: 'UPDATE products' in e.payload.get('query', ''))
    return not any(u.payload.get('args', [0])[0] < 0 for u in updates)
```

## 4. Running

There is no Python orchestrator yet, so the `sibyl` CLI cannot run this example: the promise and
`templates` in `sibyl_config.py` describe the intended shape and are not evaluated. You can run the
app itself:

```bash
pip install -e ../..  fastapi uvicorn asyncpg httpx
uvicorn main:app --port 8000
```
