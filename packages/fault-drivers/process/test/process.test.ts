import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import * as realCp from 'child_process';
import { ProcessFaultDriver } from '../src/index';

describe('Process Fault Driver', () => {
  let driver: ProcessFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let cp: typeof realCp;
  
  beforeEach(() => {
    driver = new ProcessFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();
    
    driver.install({
      clock: {} as any,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent
    });

    cp = driver.wrapChildProcess(realCp);
  });

  it('passes through normally when no fault is injected', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    
    const result = await new Promise<string>((resolve, reject) => {
      cp.exec('node -e "console.log(1+1)"', (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      });
    });
    
    expect(result).toBe('2');
    expect(mockGetFaultDecision).toHaveBeenCalledWith('PROCESS', { command: 'node -e "console.log(1+1)"' });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('injects CRASH via SIGKILL', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'PROCESS',
      type: 'CRASH'
    });

    // Run a script that sleeps for 5 seconds
    const start = Date.now();
    const err: any = await new Promise((resolve) => {
      cp.exec('node -e "setTimeout(() => {}, 5000)"', (err) => resolve(err));
    });
    const duration = Date.now() - start;

    expect(err).toBeDefined();
    // It should have been killed almost instantly
    expect(duration).toBeLessThan(1000);
    // Node exec will report the signal that killed it
    expect(err.signal).toBe('SIGKILL');

    expect(mockRecordEvent).toHaveBeenCalled();
  });

  it('injects OOM_KILL via SIGKILL (returns 137 exit code analog)', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'PROCESS',
      type: 'OOM_KILL'
    });

    const child = cp.spawn('node', ['-e', 'setTimeout(() => {}, 5000)']);
    
    const { code, signal } = await new Promise<any>((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });

    // When killed with SIGKILL, code is null and signal is SIGKILL. 
    // This perfectly mimics OOM on linux where the shell reports 137, 
    // but Node's child process reports signal SIGKILL.
    expect(signal).toBe('SIGKILL');
  });

  it('injects SIGTERM_DURING_OPERATION after a delay', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'PROCESS',
      type: 'SIGTERM_DURING_OPERATION',
      delayMs: 200
    });

    const start = Date.now();
    const child = cp.spawn('node', ['-e', 'setTimeout(() => {}, 5000)']);
    
    const { signal } = await new Promise<any>((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
    const duration = Date.now() - start;

    expect(signal).toBe('SIGTERM');
    expect(duration).toBeGreaterThanOrEqual(150); // should wait for our 200ms delay
  });
});
