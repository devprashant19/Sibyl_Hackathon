import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { CpuFaultDriver, MemoryFaultDriver } from '../src/index';
import { WatchdogEvents, cpuLoadBetween, isWatchdogRunning, sampleCpuTimes } from '../src/watchdog';

describe('Resource Fault Drivers', () => {
  let cpuDriver: CpuFaultDriver;
  let memDriver: MemoryFaultDriver;
  let cpuEvents: ReturnType<typeof vi.fn>;
  let memEvents: ReturnType<typeof vi.fn>;
  
  beforeAll(() => {
    // Enable Sandbox mode for tests
    process.env.SIBYL_SANDBOX_MODE = 'true';
  });

  afterAll(() => {
    delete process.env.SIBYL_SANDBOX_MODE;
  });

  beforeEach(() => {
    cpuDriver = new CpuFaultDriver();
    memDriver = new MemoryFaultDriver();
    
    cpuEvents = vi.fn();
    memEvents = vi.fn();
    cpuDriver.install({ getFaultDecision: vi.fn(() => null), recordEvent: cpuEvents } as any);
    memDriver.install({ getFaultDecision: vi.fn(() => null), recordEvent: memEvents } as any);
  });
  
  afterEach(() => {
    cpuDriver.uninstall();
    memDriver.uninstall();
  });

  it('Memory driver starts and stops without crashing', async () => {
    // Start memory pressure at 10% for 500ms
    memDriver.startPressure(10, 500);
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 600));
    
    // The pressure ended on its own after 500ms and both edges were recorded
    expect(memEvents.mock.calls.map(c => c[0])).toEqual([
      { domain: 'MEMORY', payload: { utilization: 10 } },
      { domain: 'MEMORY', payload: { utilization: 0 } },
    ]);
  });

  it('CPU driver starts and stops without crashing', async () => {
    // Start CPU pressure at 10% for 500ms
    cpuDriver.startPressure(10, 500);
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 600));
    
    expect(cpuEvents.mock.calls.map(c => c[0])).toEqual([
      { domain: 'CPU', payload: { utilization: 10 } },
      { domain: 'CPU', payload: { utilization: 0 } },
    ]);
  });

  it('Watchdog triggers ABORT_PRESSURE which halts pressure', async () => {
    let abortFired = false;
    WatchdogEvents.once('ABORT_PRESSURE', () => {
      abortFired = true;
    });

    memDriver.startPressure(10, 2000);
    
    // Manually trip the safety
    WatchdogEvents.emit('ABORT_PRESSURE');
    
    expect(abortFired).toBe(true);
    expect(memEvents).toHaveBeenLastCalledWith({ domain: 'MEMORY', payload: { utilization: 0 } });
  });

  it('applies a scheduled PRESSURE fault from getFaultDecision', () => {
    const getFaultDecision = vi.fn(() => ({ domain: 'MEMORY', type: 'PRESSURE', percentage: 5, durationMs: 1000 }));
    memDriver.uninstall();
    memDriver.install({ getFaultDecision, recordEvent: memEvents } as any);

    expect(memDriver.applyScheduledFault({ service: 'cart' })).toMatchObject({ percentage: 5 });
    expect(getFaultDecision).toHaveBeenCalledWith('MEMORY', { service: 'cart' });
    expect(memEvents).toHaveBeenCalledWith({ domain: 'MEMORY', payload: { utilization: 5 } });
  });

  it('keeps the shared watchdog running until every driver has released it', () => {
    cpuDriver.startPressure(1, 5000);
    memDriver.startPressure(1, 5000);
    expect(isWatchdogRunning()).toBe(true);

    cpuDriver.uninstall();
    expect(isWatchdogRunning()).toBe(true);

    memDriver.stopPressure();
    expect(isWatchdogRunning()).toBe(false);
  });

  it('measures CPU load from per-core time deltas (os.loadavg is always 0 on Windows)', () => {
    const core = (busy: number, idle: number) => ({ model: '', speed: 0, times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } });
    const before = sampleCpuTimes([core(100, 900), core(100, 900)]);
    const after = sampleCpuTimes([core(1000, 1000), core(190, 1810)]);

    // 990 busy of 2000 elapsed across both cores
    expect(cpuLoadBetween(before, after)).toBeCloseTo(49.5);
    expect(cpuLoadBetween(after, after)).toBe(0);
  });
});
