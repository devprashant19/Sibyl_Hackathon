import logging
from typing import Callable, Any, Dict, List

logger = logging.getLogger(__name__)

class PromiseContext:
    def __init__(self, run_id: str, events: List[Dict[str, Any]]):
        self.run_id = run_id
        self.events = events
        
    def timeline(self, filter_fn: Callable[[Any], bool] = None):
        sorted_events = sorted(self.events, key=lambda e: e.get('timestamp', 0))
        if filter_fn:
            # We wrap the event dict in a simple object for nicer dot-notation access
            class EventProxy:
                def __init__(self, e):
                    self.domain = e.get('domain')
                    self.type = e.get('type')
                    self.payload = e.get('payload', {})
            return [EventProxy(e) for e in sorted_events if filter_fn(EventProxy(e))]
        return sorted_events

def define_promise(id: str, description: str, severity: str = "CRITICAL"):
    """
    Decorator to define a Sibyl invariant promise.
    """
    def decorator(func):
        func.__sibyl_promise__ = {
            "id": id,
            "description": description,
            "severity": severity
        }
        return func
    return decorator

_installed: set = set()


def install(intercept_http: bool = True, intercept_db: bool = True, intercept_clock: bool = False):
    """
    Installs Sibyl's HTTP (requests, httpx) and DB (psycopg2, asyncpg) interception. Idempotent.

    The clock is never patched globally: patching ``time.sleep``/``asyncio.sleep`` process-wide
    made servers' event loops spin and broke ``isinstance`` checks on ``datetime``. Use the scoped
    ``with sibyl.VirtualClock(...):`` around the code under simulation instead.
    """
    if intercept_clock:
        raise ValueError(
            "install(intercept_clock=True) is no longer supported: the clock is not patched globally. "
            "Wrap the simulated code in `with sibyl.VirtualClock():` instead."
        )
    logger.info("[Sibyl] Installing fault drivers...")

    if intercept_http and "http" not in _installed:
        _installed.add("http")
        logger.info("[Sibyl] -> HTTP driver active.")
        from .drivers.http import install_http
        install_http()

    if intercept_db and "db" not in _installed:
        _installed.add("db")
        logger.info("[Sibyl] -> Postgres driver active.")
        from .drivers.db import install_db
        install_db()
