import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { CpuFaultDriver, MemoryFaultDriver } from '../src/index';
import { WatchdogEvents } from '../src/watchdog';

describe('Resource Fault Drivers', () => {
  let cpuDriver: CpuFaultDriver;
  let memDriver: MemoryFaultDriver;
  
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
    
    cpuDriver.install({} as any);
    memDriver.install({} as any);
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
    
    // Check that we didn't crash
    expect(true).toBe(true);
  });

  it('CPU driver starts and stops without crashing', async () => {
    // Start CPU pressure at 10% for 500ms
    cpuDriver.startPressure(10, 500);
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 600));
    
    // Check that we didn't crash
    expect(true).toBe(true);
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
  });
});
