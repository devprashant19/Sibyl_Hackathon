import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { HttpFaultDriver } from '../src/index';
import type { DriverContext } from '@sibyl-core';
import { VirtualClock } from '../../../core/src/clock';
import { FaultSpec } from '@sibyl-shared';
import * as http from 'http';

describe('HttpFaultDriver with VirtualClock', () => {
  let clock: VirtualClock;
  let driver: HttpFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as import('net').AddressInfo;
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    clock = new VirtualClock();
    clock.install({ mode: 'real-time' });

    driver = new HttpFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();

    const context: DriverContext = {
      clock,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent,
    };

    driver.install(context);
  });

  afterEach(() => {
    driver.uninstall();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it('should pass through requests when no fault is decided', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    
    const res = await fetch(`${serverUrl}/test-pass-through`);
    expect(res.status).toBe(200);

    expect(mockGetFaultDecision).toHaveBeenCalledWith('HTTP', expect.objectContaining({
      url: `${serverUrl}/test-pass-through`,
      method: 'GET'
    }));
  });

  it('should instantly simulate a CONNECTION_REFUSED fault', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'HTTP',
      type: 'CONNECTION_REFUSED'
    } as FaultSpec);

    try {
      await fetch(`${serverUrl}/`);
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.message).toMatch(/fetch failed/);
      expect(e.cause?.message).toBe('ECONNREFUSED');
    }
    expect(mockRecordEvent).toHaveBeenCalled();
  });

  it('should instantly return HTTP_5XX response', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'HTTP',
      type: 'HTTP_5XX',
      statusCode: 503
    } as any);

    const res = await fetch(`${serverUrl}/api`);
    expect(res.status).toBe(503);
  });

  it('should delay response for SLOW_RESPONSE', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'HTTP',
      type: 'SLOW_RESPONSE',
      delayMs: 100
    } as any);

    const start = performance.now();
    await fetch(`${serverUrl}/slow`);
    const end = performance.now();

    expect(end - start).toBeGreaterThanOrEqual(90);
  });

  it('should delay and then throw TIMEOUT', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'HTTP',
      type: 'TIMEOUT',
      delayMs: 100
    } as any);

    const start = performance.now();
    let errorCause = '';
    try {
      await fetch(`${serverUrl}/`);
    } catch (e: any) {
      errorCause = e.cause?.message || e.message;
    }
    const end = performance.now();

    expect(errorCause).toMatch(/ETIMEDOUT/);
    expect(end - start).toBeGreaterThanOrEqual(90);
  });

  it('should simulate PARTIAL_RESPONSE stream crashing', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'HTTP',
      type: 'PARTIAL_RESPONSE'
    } as any);

    const res = await fetch(`${serverUrl}/partial`);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    // First read should get the partial data
    const chunk1 = await reader!.read();
    expect(chunk1.done).toBe(false);
    expect(new TextDecoder().decode(chunk1.value)).toBe('{"partial": true,');

    // Second read should throw an error or abruptly close
    try {
      const chunk2 = await reader!.read();
      if (!chunk2.done) {
        expect.fail('Stream should have crashed or closed abruptly');
      }
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
