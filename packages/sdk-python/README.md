# sibyl-sdk (Python) — experimental

Early building blocks for a Python SDK. There is no Python orchestrator yet: the `sibyl` CLI runs
TypeScript configs only, and nothing here runs a search or talks to the Sibyl API. Not published to
PyPI; install from this directory with `pip install -e packages/sdk-python`.

## What exists

- `sibyl.install()` — installs pass-through hooks on `requests`, `httpx`, `psycopg2` and `asyncpg`
  (whichever are importable; extras `[http]` and `[db]` install them). Idempotent. It does **not**
  touch the clock.
- `sibyl.VirtualClock` — a scoped, opt-in virtual wall clock:

  ```python
  from sibyl import VirtualClock

  with VirtualClock(start=1_700_000_000, freeze=True, accelerate_sleeps=True) as clock:
      time.time()                  # 1700000000.0
      time.sleep(3600)             # returns almost immediately; virtual time moves 1h
      datetime.datetime.now()      # a real datetime; isinstance checks keep working
  ```

  Only code running in the `with` block's context (and asyncio tasks created inside it) sees virtual
  time; server event loops, earlier tasks and other threads keep real time and real sleeps.
  `time.monotonic` is never patched. Accelerated sleeps still wait `real_sleep_floor` (1ms) of real
  time so polling loops do not spin. Modules that did `from datetime import datetime` before the
  block keep the real class. See `sibyl/clock.py` for details.
- `@sibyl.define_promise(id, description, severity)` and `sibyl.PromiseContext` — the intended
  shape of promises over captured events.

## Tests

```bash
cd packages/sdk-python
python -m unittest
```
