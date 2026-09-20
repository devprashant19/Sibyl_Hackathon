import asyncio
import datetime
import threading
import time
import unittest

import sibyl
from sibyl import VirtualClock, current_clock
from sibyl import clock as clock_module

START = 1_700_000_000.0


class ClockIsOptIn(unittest.TestCase):
    def test_importing_and_installing_patches_nothing(self):
        sibyl.install(intercept_http=False, intercept_db=False)
        self.assertIs(time.time, clock_module._real_time)
        self.assertIs(time.sleep, clock_module._real_sleep)
        self.assertIs(asyncio.sleep, clock_module._real_asyncio_sleep)
        self.assertIs(datetime.datetime, clock_module._RealDatetime)

    def test_global_clock_install_is_refused(self):
        with self.assertRaises(ValueError):
            sibyl.install(intercept_http=False, intercept_db=False, intercept_clock=True)


class ScopedVirtualTime(unittest.TestCase):
    def test_time_and_datetime_are_virtual_inside_and_real_after(self):
        with VirtualClock(start=START, freeze=True) as clock:
            self.assertIs(current_clock(), clock)
            self.assertEqual(time.time(), START)
            self.assertEqual(time.time_ns(), int(START * 1_000_000_000))
            clock.advance(90)
            self.assertEqual(time.time(), START + 90)
            now = datetime.datetime.now(datetime.timezone.utc)
            self.assertEqual(now, clock_module._RealDatetime.fromtimestamp(START + 90, datetime.timezone.utc))
            self.assertIs(type(now), clock_module._RealDatetime)
        self.assertIsNone(current_clock())
        self.assertGreater(time.time(), START + 10_000_000)
        self.assertIs(time.time, clock_module._real_time)
        self.assertIs(datetime.datetime, clock_module._RealDatetime)

    def test_patches_are_restored_when_the_block_raises(self):
        with self.assertRaises(RuntimeError):
            with VirtualClock(start=START, freeze=True):
                raise RuntimeError("boom")
        self.assertIs(time.time, clock_module._real_time)
        self.assertIs(asyncio.sleep, clock_module._real_asyncio_sleep)
        self.assertIs(datetime.datetime, clock_module._RealDatetime)

    def test_nested_clocks_restore_the_outer_clock(self):
        with VirtualClock(start=START, freeze=True):
            with VirtualClock(start=START + 1000, freeze=True):
                self.assertEqual(time.time(), START + 1000)
            self.assertEqual(time.time(), START)
            self.assertIsNot(time.time, clock_module._real_time)
        self.assertIs(time.time, clock_module._real_time)

    def test_unfrozen_clock_moves_with_real_time(self):
        with VirtualClock(start=START) as clock:
            first = time.time()
            clock_module._real_sleep(0.02)
            self.assertGreater(time.time(), first)

    def test_advance_rejects_going_backwards(self):
        with self.assertRaises(ValueError):
            VirtualClock().advance(-1)


class DatetimeStaysCompatible(unittest.TestCase):
    def test_isinstance_and_issubclass_work_with_the_patched_class(self):
        real_dt = clock_module._RealDatetime(2024, 1, 1, 12, 0)
        with VirtualClock(start=START, freeze=True):
            self.assertIsNot(datetime.datetime, clock_module._RealDatetime)
            self.assertIsInstance(real_dt, datetime.datetime)
            self.assertIsInstance(datetime.datetime.now(), datetime.datetime)
            self.assertIsInstance(datetime.datetime.now(), clock_module._RealDatetime)
            self.assertTrue(issubclass(clock_module._RealDatetime, datetime.datetime))
            constructed = datetime.datetime(2024, 1, 1, 12, 0)
            self.assertIsInstance(constructed, clock_module._RealDatetime)
            self.assertEqual(constructed, real_dt)
            self.assertFalse(isinstance(datetime.date(2024, 1, 1), datetime.datetime))
            self.assertEqual(datetime.datetime.today().date(), clock_module._RealDatetime.fromtimestamp(START).date())


class OnlyTheSimulationSeesVirtualTime(unittest.TestCase):
    def test_other_threads_keep_real_time_and_real_sleep(self):
        seen = {}
        entered = threading.Event()
        release = threading.Event()

        def background():
            entered.wait(5)
            seen["time"] = time.time()
            t0 = time.monotonic()
            time.sleep(0.05)
            seen["slept"] = time.monotonic() - t0
            release.set()

        worker = threading.Thread(target=background)
        worker.start()
        with VirtualClock(start=START, freeze=True, accelerate_sleeps=True):
            entered.set()
            release.wait(5)
        worker.join(5)
        self.assertGreater(seen["time"], START + 10_000_000)
        self.assertGreaterEqual(seen["slept"], 0.04)

    def test_sleeps_are_real_by_default(self):
        with VirtualClock(start=START, freeze=True):
            t0 = time.monotonic()
            time.sleep(0.05)
            self.assertGreaterEqual(time.monotonic() - t0, 0.04)
            self.assertEqual(time.time(), START)

    def test_accelerated_sleep_advances_virtual_time_without_waiting(self):
        with VirtualClock(start=START, freeze=True, accelerate_sleeps=True):
            t0 = time.monotonic()
            time.sleep(3600)
            self.assertLess(time.monotonic() - t0, 1.0)
            self.assertEqual(time.time(), START + 3600)


class AsyncioIsNotBusyLooped(unittest.TestCase):
    def test_server_loop_task_keeps_real_sleeps_while_a_simulation_accelerates(self):
        async def main():
            ticks = 0
            stop = asyncio.Event()

            async def server_poll_loop():
                # Created outside any clock: must keep sleeping for real (no 100% CPU spin).
                nonlocal ticks
                while not stop.is_set():
                    await asyncio.sleep(0.02)
                    ticks += 1

            async def simulation():
                with VirtualClock(start=START, freeze=True, accelerate_sleeps=True):
                    async def inner():
                        await asyncio.sleep(3600)
                        return time.time()
                    # A task created inside the block inherits the virtual clock.
                    virtual_after = await asyncio.create_task(inner())
                    await asyncio.sleep(0.2)  # accelerated here, too: advances by 0.2
                    real_wait_start = clock_module._real_monotonic()
                    await clock_module._real_asyncio_sleep(0.2)
                    return virtual_after, clock_module._real_monotonic() - real_wait_start

            server = asyncio.create_task(server_poll_loop())
            t0 = time.monotonic()
            virtual_after, _ = await simulation()
            elapsed = time.monotonic() - t0
            stop.set()
            await server
            return ticks, elapsed, virtual_after

        ticks, elapsed, virtual_after = asyncio.run(main())
        self.assertEqual(virtual_after, START + 3600)
        # ~0.2s of real waiting at 20ms per tick is ~10 ticks; a spinning loop would do thousands.
        self.assertLess(ticks, 5 + int(elapsed / 0.02) * 2)
        self.assertIs(asyncio.sleep, clock_module._real_asyncio_sleep)

    def test_accelerated_asyncio_sleep_still_yields_real_time(self):
        async def main():
            with VirtualClock(start=START, freeze=True, accelerate_sleeps=True, real_sleep_floor=0.005):
                t0 = time.monotonic()
                for _ in range(20):
                    await asyncio.sleep(1)
                return time.monotonic() - t0, time.time()

        real, virtual = asyncio.run(main())
        self.assertGreaterEqual(real, 0.05)
        self.assertEqual(virtual, START + 20)


if __name__ == "__main__":
    unittest.main()
