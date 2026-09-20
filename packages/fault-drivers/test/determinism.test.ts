import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { VirtualClock } from '../../core/src/clock';
import { PRNG } from '../../core/src/prng';
import type { DriverContext, FaultDriver } from '../../core/src/driver';
import { FaultSpec, CapturedEvent } from '../../shared/src/schemas';

// Import all drivers
import { HttpFaultDriver } from '../http/src';
import { DatabaseFaultDriver } from '../db/src';
import { MqFaultDriver } from '../mq/src';
import { GrpcFaultDriver } from '../grpc/src';
import { FilesystemFaultDriver } from '../filesystem/src';
import { ProcessFaultDriver } from '../process/src';
import { CpuFaultDriver, MemoryFaultDriver } from '../resource/src';

// --- Arbitraries for FaultSpecs ---

const HttpFaultSpecArb = fc.record({
  domain: fc.constant('HTTP'),
  type: fc.constantFrom('TIMEOUT', 'CONNECTION_REFUSED', 'HTTP_5XX', 'HTTP_4XX', 'SLOW_RESPONSE', 'PARTIAL_RESPONSE', 'DUPLICATE_RESPONSE', 'DNS_FAILURE', 'TLS_HANDSHAKE_FAILURE'),
  status: fc.integer({ min: 400, max: 599 }),
  delayMs: fc.integer({ min: 1, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const DatabaseFaultSpecArb = fc.record({
  domain: fc.constant('DATABASE'),
  type: fc.constantFrom('QUERY_TIMEOUT', 'CONNECTION_DROP', 'DEADLOCK', 'SLOW_QUERY', 'PARTIAL_COMMIT'),
  delayMs: fc.integer({ min: 1, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const MessageQueueFaultSpecArb = fc.record({
  domain: fc.constant('MESSAGE_QUEUE'),
  type: fc.constantFrom('MESSAGE_DELAY', 'MESSAGE_DUPLICATE', 'MESSAGE_LOSS', 'OUT_OF_ORDER_DELIVERY', 'CONSUMER_CRASH_MID_PROCESSING'),
  delayMs: fc.integer({ min: 1, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const GrpcFaultSpecArb = fc.record({
  domain: fc.constant('GRPC'),
  type: fc.constantFrom('DEADLINE_EXCEEDED', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'),
  delayMs: fc.integer({ min: 1, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const FilesystemFaultSpecArb = fc.record({
  domain: fc.constant('FILESYSTEM'),
  type: fc.constantFrom('DISK_FULL', 'SLOW_IO', 'PERMISSION_DENIED', 'PARTIAL_WRITE'),
  delayMs: fc.integer({ min: 1, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const ProcessFaultSpecArb = fc.record({
  domain: fc.constant('PROCESS'),
  type: fc.constantFrom('CRASH', 'OOM_KILL', 'SIGTERM_DURING_OPERATION')
}) as fc.Arbitrary<FaultSpec>;

const CpuFaultSpecArb = fc.record({
  domain: fc.constant('CPU'),
  type: fc.constant('PRESSURE'),
  percentage: fc.integer({ min: 1, max: 99 }),
  durationMs: fc.integer({ min: 10, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

const MemoryFaultSpecArb = fc.record({
  domain: fc.constant('MEMORY'),
  type: fc.constant('PRESSURE'),
  percentage: fc.integer({ min: 1, max: 99 }),
  durationMs: fc.integer({ min: 10, max: 100 })
}) as fc.Arbitrary<FaultSpec>;

// --- Harness ---

async function assertDeterminism<T extends FaultDriver>(
  DriverClass: new () => T,
  domain: string,
  specsArb: fc.Arbitrary<FaultSpec[]>,
  workload: (driver: T) => Promise<void> | void
) {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(),
      specsArb,
      async (seed, specs) => {
        const events1 = await runSimulation(DriverClass, domain, seed, specs, workload);
        const events2 = await runSimulation(DriverClass, domain, seed, specs, workload);
        expect(events1).toEqual(events2);
      }
    ),
    { numRuns: 10 }
  );
}

async function runSimulation<T extends FaultDriver>(
  DriverClass: new () => T,
  domain: string,
  seed: number,
  specs: FaultSpec[],
  workload: (driver: T) => Promise<void> | void
): Promise<CapturedEvent[]> {
  const clock = new VirtualClock();
  clock.install({ mode: 'accelerated', startTime: 1000000 });
  const prng = new PRNG(seed);
  
  const events: CapturedEvent[] = [];
  let currentSpecIdx = 0;

  const context: DriverContext = {
    clock,
    prng,
    getFaultDecision: (d, meta) => {
      if (d !== domain) return null;
      if (currentSpecIdx >= specs.length) return null;
      return specs[currentSpecIdx++];
    },
    recordEvent: (event) => {
      events.push({
        ...event,
        id: prng.next().toString(),
        timestamp: clock.getVirtualTime()
      } as CapturedEvent);
    }
  };

  const driver = new DriverClass();
  driver.install(context);

  try {
    const workloadPromise = Promise.resolve().then(() => workload(driver));
    
    let finished = false;
    workloadPromise.then(() => { finished = true; }).catch(() => { finished = true; });
    
    let iters = 0;
    while (!finished && iters < 100) {
      await clock.runAllAsync();
      await new Promise(r => setImmediate(r));
      iters++;
    }
  } catch (err) {
  } finally {
    driver.uninstall();
    clock.uninstall();
  }

  return events;
}

// --- Driver Suites ---

describe('Fault Driver Determinism Properties', () => {

  it('HTTP Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      HttpFaultDriver, 
      'HTTP', 
      fc.array(HttpFaultSpecArb, { maxLength: 3 }),
      async () => {
        try {
          await fetch('http://example.com/api/users');
        } catch {}
      }
    );
  });

  it('Filesystem Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      FilesystemFaultDriver,
      'FILESYSTEM',
      fc.array(FilesystemFaultSpecArb, { maxLength: 3 }),
      async () => {
        const fs = await import('fs');
        try { fs.readFileSync('/tmp/test-file.txt'); } catch {}
        try { fs.writeFileSync('/tmp/test-file2.txt', 'data'); } catch {}
      }
    );
  });

  it('Database Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      DatabaseFaultDriver,
      'DATABASE',
      fc.array(DatabaseFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const mockPool = { query: async () => [{ id: 1 }] };
        const wrapped = driver.wrapPgPool(mockPool);
        try { await wrapped.query('SELECT 1'); } catch {}
      }
    );
  });

  it('MQ Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      MqFaultDriver,
      'MESSAGE_QUEUE',
      fc.array(MessageQueueFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const kafka = {
          producer: () => ({ send: async () => [{ errorCode: 0 }] }),
          consumer: () => ({ run: async (c: any) => {
            if (c.eachMessage) {
              try { await c.eachMessage({ topic: 'test', message: { key: '1' } }); } catch {}
            }
          }})
        };
        const wrapped = driver.wrapKafka(kafka);
        try { await wrapped.producer().send({ topic: 'test', messages: [{ value: '1' }] }); } catch {}
        try { await wrapped.consumer().run({ eachMessage: async () => {} }); } catch {}
      }
    );
  });

  it('gRPC Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      GrpcFaultDriver,
      'GRPC',
      fc.array(GrpcFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const interceptor = driver.createInterceptor();
        const nextCall = () => (metadata: any, listener: any) => {};
        const options = { method_definition: { path: '/Service/Method' } } as any;
        const call = interceptor(options, nextCall);
        
        try {
          // Simulate start call
          (call as any).requester.start({}, { onReceiveStatus: () => {} }, () => {});
        } catch {}
      }
    );
  });

  it('Process Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      ProcessFaultDriver,
      'PROCESS',
      fc.array(ProcessFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const mockCp = {
          spawn: () => ({ pid: 999, kill: () => {} }),
          exec: () => ({ pid: 998, kill: () => {} }),
          fork: () => ({ pid: 997, kill: () => {} })
        };
        const wrapped = driver.wrapChildProcess(mockCp);
        try { wrapped.spawn('ls'); } catch {}
      }
    );
  });

  it('CPU Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      CpuFaultDriver,
      'CPU',
      fc.array(CpuFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        process.env.SIBYL_SANDBOX_MODE = 'true';
        try { driver.startPressure(50, 50); } catch {}
        try { driver.stopPressure(); } catch {}
      }
    );
  });

  it('Memory Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      MemoryFaultDriver,
      'MEMORY',
      fc.array(MemoryFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        process.env.SIBYL_SANDBOX_MODE = 'true';
        try { driver.startPressure(50, 50); } catch {}
        try { driver.stopPressure(); } catch {}
      }
    );
  });

});
