# sibyl-sdk (Python)

The official Python SDK for the Sibyl chaos engineering platform.

## Installation

```bash
pip install sibyl-sdk
```

## Quickstart

```python
from sibyl import define_promise, PromiseContext

@define_promise(
    id="no-double-charges",
    name="No Double Charges",
    severity="CRITICAL"
)
def no_double_charges(ctx: PromiseContext) -> bool:
    charges = ctx.timeline(lambda e: e.domain == "HTTP" and "/charges" in e.metadata.get("path", ""))
    idempotency_keys = [e.metadata.get("idempotency_key") for e in charges]
    return len(idempotency_keys) == len(set(idempotency_keys))
```

## pytest Integration

```python
# test_checkout.py
import pytest
from sibyl.pytest import sibyl_test

@sibyl_test(iterations=100, seed="0xBEEF", strategy="mcts")
def test_no_double_charges(sibyl_run):
    """Sibyl will run the decorated function 100 times with fault injection."""
    from checkout import process_payment
    process_payment(order_id="test-123", amount=49.99)
```

Run with:
```bash
pytest test_checkout.py -v
```

## API

### `@define_promise(id, name, severity)`

Decorator that creates a promise definition from a function.

### `PromiseContext`

| Attribute | Type | Description |
|---|---|---|
| `run_id` | `str` | Current simulation run ID |
| `events` | `list[CapturedEvent]` | All captured events |
| `timeline(filter_fn)` | `list[CapturedEvent]` | Sorted, optionally filtered events |

### `sibyl.install()`

Auto-wires fault drivers for `requests`, `httpx`, `psycopg2`, `sqlalchemy`, and `confluent-kafka`.

## Configuration

```toml
# pyproject.toml
[tool.sibyl]
config = "sibyl_config.py"
default_iterations = 200
default_strategy = "mcts"
```

## Examples

See `examples/quickstart/` for a complete working example with Flask + PostgreSQL.
