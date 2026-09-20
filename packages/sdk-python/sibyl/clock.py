"""A scoped, opt-in virtual clock.

    from sibyl import VirtualClock

    with VirtualClock(start=1_700_000_000, freeze=True) as clock:
        time.time()               # 1_700_000_000.0
        clock.advance(60)
        datetime.datetime.now()   # one minute later, a real ``datetime.datetime`` instance

Design constraints (each one fixes a bug of the previous global patching):

* Nothing is patched at import time or by ``sibyl.install()``. Patches are installed when the first
  clock is entered and removed when the last one exits, in a ``finally``.
* The patched functions consult a ``ContextVar``. Code that is not running inside a clock's
  context -- the web server's event loop, tasks created before the clock was entered, other threads
  -- keeps seeing real time and real sleeps. asyncio tasks created inside the ``with`` block
  inherit the context and see virtual time. (Plain threads started inside the block do not inherit
  it; run their target through ``contextvars.copy_context().run`` if they should.)
* Only wall-clock functions are virtualised (``time.time``, ``time.time_ns``,
  ``datetime.datetime.now/utcnow/today``). ``time.monotonic``/``perf_counter`` are left alone
  because asyncio schedules timers with them.
* ``datetime.datetime`` is temporarily replaced by a subclass whose metaclass delegates
  ``isinstance``/``issubclass`` to the real class, so ``isinstance(real_dt, datetime.datetime)``
  keeps working, and ``now()`` returns real ``datetime.datetime`` instances. Modules that did
  ``from datetime import datetime`` before the clock was entered keep the real class (and real time).
* Sleeps are real unless ``accelerate_sleeps=True``. When accelerated, ``time.sleep(d)`` and
  ``asyncio.sleep(d)`` advance the virtual clock by ``d`` and then really sleep
  ``min(d, real_sleep_floor)`` so a polling loop still yields the CPU instead of spinning.
"""

from __future__ import annotations

import asyncio
import contextvars
import datetime as _datetime_module
import threading
import time as _time_module
from typing import Optional

__all__ = ["VirtualClock", "current_clock"]

_real_time = _time_module.time
_real_time_ns = _time_module.time_ns
_real_monotonic = _time_module.monotonic
_real_sleep = _time_module.sleep
_real_asyncio_sleep = asyncio.sleep
_RealDatetime = _datetime_module.datetime

_active: contextvars.ContextVar[Optional["VirtualClock"]] = contextvars.ContextVar("sibyl_virtual_clock", default=None)


def current_clock() -> Optional["VirtualClock"]:
    """The clock active in the current context, if any."""
    return _active.get()


class VirtualClock:
    def __init__(
        self,
        start: Optional[float] = None,
        *,
        freeze: bool = False,
        accelerate_sleeps: bool = False,
        real_sleep_floor: float = 0.001,
    ) -> None:
        """
        :param start: virtual epoch seconds at creation (default: the real current time).
        :param freeze: if True, virtual time only moves via ``advance()`` (and accelerated sleeps);
            otherwise it also moves forward with real elapsed time.
        :param accelerate_sleeps: if True, sleeps inside the clock's context advance virtual time
            instead of waiting for real.
        :param real_sleep_floor: real seconds an accelerated sleep still waits (at most ``d``).
        """
        if real_sleep_floor < 0:
            raise ValueError("real_sleep_floor must be >= 0")
        self._start = _real_time() if start is None else float(start)
        self._mono_start = _real_monotonic()
        self._offset = 0.0
        self._lock = threading.Lock()
        self.freeze = freeze
        self.accelerate_sleeps = accelerate_sleeps
        self.real_sleep_floor = real_sleep_floor
        self._tokens: list[contextvars.Token] = []

    # -- reading and moving time -------------------------------------------------------------

    def time(self) -> float:
        with self._lock:
            elapsed = 0.0 if self.freeze else _real_monotonic() - self._mono_start
            return self._start + elapsed + self._offset

    def time_ns(self) -> int:
        return int(self.time() * 1_000_000_000)

    def advance(self, seconds: float) -> None:
        if seconds < 0:
            raise ValueError("a clock cannot go backwards")
        with self._lock:
            self._offset += seconds

    def now(self, tz: Optional[_datetime_module.tzinfo] = None) -> _datetime_module.datetime:
        return _RealDatetime.fromtimestamp(self.time(), tz)

    # -- scoping -------------------------------------------------------------------------------

    def __enter__(self) -> "VirtualClock":
        _install_patches()
        self._tokens.append(_active.set(self))
        return self

    def __exit__(self, *exc_info: object) -> None:
        try:
            _active.reset(self._tokens.pop())
        finally:
            _remove_patches()


# -- patched functions: virtual inside a clock's context, the real thing everywhere else ----------


def _patched_time() -> float:
    clock = _active.get()
    return clock.time() if clock is not None else _real_time()


def _patched_time_ns() -> int:
    clock = _active.get()
    return clock.time_ns() if clock is not None else _real_time_ns()


def _patched_sleep(seconds: float) -> None:
    clock = _active.get()
    if clock is None or not clock.accelerate_sleeps:
        return _real_sleep(seconds)
    seconds = max(0.0, seconds)
    clock.advance(seconds)
    _real_sleep(min(seconds, clock.real_sleep_floor))


async def _patched_asyncio_sleep(delay: float, result=None):
    clock = _active.get()
    if clock is None or not clock.accelerate_sleeps:
        return await _real_asyncio_sleep(delay, result)
    delay = max(0.0, delay)
    clock.advance(delay)
    return await _real_asyncio_sleep(min(delay, clock.real_sleep_floor), result)


class _DatetimeMeta(type):
    def __instancecheck__(cls, obj: object) -> bool:
        return isinstance(obj, _RealDatetime)

    def __subclasscheck__(cls, subclass: type) -> bool:
        return issubclass(subclass, _RealDatetime)


class _VirtualDatetime(_RealDatetime, metaclass=_DatetimeMeta):
    """Stands in for ``datetime.datetime`` while a clock is active anywhere in the process."""

    @classmethod
    def now(cls, tz=None):
        clock = _active.get()
        return clock.now(tz) if clock is not None else _RealDatetime.now(tz)

    @classmethod
    def utcnow(cls):
        clock = _active.get()
        if clock is None:
            return _RealDatetime.now(_datetime_module.timezone.utc).replace(tzinfo=None)
        return clock.now(_datetime_module.timezone.utc).replace(tzinfo=None)

    @classmethod
    def today(cls):
        return cls.now()


_PATCHES = (
    (_time_module, "time", _real_time, _patched_time),
    (_time_module, "time_ns", _real_time_ns, _patched_time_ns),
    (_time_module, "sleep", _real_sleep, _patched_sleep),
    (asyncio, "sleep", _real_asyncio_sleep, _patched_asyncio_sleep),
    (_datetime_module, "datetime", _RealDatetime, _VirtualDatetime),
)

_patch_lock = threading.Lock()
_patch_depth = 0


def _install_patches() -> None:
    global _patch_depth
    with _patch_lock:
        if _patch_depth == 0:
            for module, name, _real, fake in _PATCHES:
                setattr(module, name, fake)
        _patch_depth += 1


def _remove_patches() -> None:
    global _patch_depth
    with _patch_lock:
        _patch_depth -= 1
        if _patch_depth == 0:
            for module, name, real, fake in _PATCHES:
                # Leave anything someone else patched on top of ours alone.
                if getattr(module, name) is fake:
                    setattr(module, name, real)
