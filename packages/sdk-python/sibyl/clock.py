import time
import asyncio
import datetime
from unittest.mock import patch

# Extremely basic Virtual Clock patching for Python
_original_time = time.time
_original_sleep = time.sleep
_original_asyncio_sleep = asyncio.sleep
_original_now = datetime.datetime.now

# In a real SDK, we would maintain a virtual time offset and queue
_virtual_time_offset = 0

def fake_time():
    return _original_time() + _virtual_time_offset

def fake_sleep(seconds):
    global _virtual_time_offset
    # Accelerated time: we don't actually sleep, we just jump the clock forward
    _virtual_time_offset += seconds

async def fake_asyncio_sleep(delay, result=None):
    global _virtual_time_offset
    _virtual_time_offset += delay
    # Yield to event loop to allow other tasks to run
    await _original_asyncio_sleep(0)
    return result

class FakeDatetime(datetime.datetime):
    @classmethod
    def now(cls, tz=None):
        ts = fake_time()
        return cls.fromtimestamp(ts, tz)

def install_clock():
    time.time = fake_time
    time.sleep = fake_sleep
    asyncio.sleep = fake_asyncio_sleep
    datetime.datetime = FakeDatetime
