import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
// Default import: the interceptor patches the CommonJS module object, which a namespace import doesn't see.
import http from 'http';
import * as realFs from 'fs';
import * as realCp from 'child_process';
import * as os from 'os';
import * as path from 'path';
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

/**
 * Runs the workload twice per generated (seed, specs) and requires byte-identical event logs.
 * `expectedEvents` pins how many events the specs must produce, so a workload that never reaches the
 * driver (and trivially compares two empty logs) fails instead of passing.
 */
async function assertDeterminism<T extends FaultDriver>(
  DriverClass: new () => T,
  domain: string,
  specsArb: fc.Arbitrary<FaultSpec[]>,
  workload: (driver: T) => Promise<void> | void,
  expectedEvents: (specs: FaultSpec[]) => number
) {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(),
      specsArb,
      async (seed, specs) => {
        const events1 = await runSimulation(DriverClass, domain, seed, specs, workload);
        const events2 = await runSimulation(DriverClass, domain, seed, specs, workload);
        expect(events1).toEqual(events2);
        expect(events1).toHaveLength(expectedEvents(specs));
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
    let finished = false;
    let workloadError: unknown;
    Promise.resolve()
      .then(() => workload(driver))
      .catch(err => { workloadError = err; })
      .finally(() => { finished = true; });

    // performance.now is not virtualised, so this bounds real time even while the clock is installed.
    const deadline = performance.now() + 10_000;
    while (!finished) {
      if (performance.now() > deadline) throw new Error(`${domain} workload did not finish`);
      await clock.runAllAsync();
      await new Promise(r => setImmediate(r));
    }
    if (workloadError) throw workloadError;
  } finally {
    driver.uninstall();
    clock.uninstall();
  }

  return events;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Driver Suites ---

describe('Fault Driver Determinism Properties', () => {
  let server: http.Server;
  let serverUrl: string;
  const fsDir = path.join(os.tmpdir(), 'sibyl-determinism-fs');

  beforeAll(async () => {
    server = http.createServer((req, res) => res.end('OK'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    serverUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
    realFs.mkdirSync(fsDir, { recursive: true });
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    realFs.rmSync(fsDir, { recursive: true, force: true });
  });

  it('HTTP Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      HttpFaultDriver,
      'HTTP',
      fc.array(HttpFaultSpecArb, { maxLength: 3 }),
      async () => {
        // node:http rather than fetch: undici keeps a 1s JS timer ticking while a request is in flight,
        // and the harness fires it on every loop turn, so a later request's virtual timestamp would
        // depend on the previous round trip's real latency.
        for (let i = 0; i < 3; i++) {
          await new Promise<void>(resolve => {
            http.get(`${serverUrl}/api/users/${i}`, res => {
              res.on('error', () => {}).on('close', () => resolve()).resume();
            }).on('error', () => resolve());
          });
        }
      },
      // Every intercepted request with a fault records one event
      specs => specs.length
    );
  });

  it('Filesystem Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      FilesystemFaultDriver,
      'FILESYSTEM',
      fc.array(FilesystemFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const fs = driver.wrapFs(realFs);
        const file = path.join(fsDir, 'test-file.txt');
        try { fs.writeFileSync(file, 'data'); } catch {}
        try { fs.readFileSync(file); } catch {}
        try { await fs.promises.stat(file); } catch {}
      },
      specs => specs.length
    );
  });

  it('Database Driver produces identical CapturedEvents', async () => {
    await assertDeterminism(
      DatabaseFaultDriver,
      'DATABASE',
      fc.array(DatabaseFaultSpecArb, { maxLength: 3 }),
      async (driver) => {
        const mockClient = { query: async () => ({ rows: [{ id: 1 }] }), release: () => {} };
        const mockPool = { connect: async () => mockClient, query: async () => ({ rows: [{ id: 1 }] }) };
        const client = await driver.wrapPgPool(mockPool).connect();
        for (const statement of ['BEGIN', "INSERT INTO users VALUES ('a')", "INSERT INTO users VALUES ('b')", 'COMMIT']) {
          try { await client.query(statement); } catch {}
        }
      },
      // Spec i is decided for statement i. PARTIAL_COMMIT only fires on the second statement inside
      // the transaction (index 2, after BEGIN); every other fault type always fires.
      specs => specs.filter((spec, i) => spec.type !== 'PARTIAL_COMMIT' || i === 2).length
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
              try { await c.eachMessage({ topic: 'test', partition: 0, message: { key: '1' } }); } catch {}
            }
          }})
        };
        class SendMessageCommand { constructor(public input: any) {} }
        const sqs = { send: async () => ({ MessageId: 'real' }) };

        const wrapped = driver.wrapKafka(kafka);
        try { await wrapped.producer().send({ topic: 'test', messages: [{ value: '1' }, { value: '2' }] }); } catch {}
        try { await wrapped.consumer().run({ eachMessage: async () => {} }); } catch {}
        try { await driver.wrapSqsClient(sqs).send(new SendMessageCommand({ QueueUrl: 'q', MessageBody: 'm' })); } catch {}
      },
      specs => specs.length
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

        for (let i = 0; i < 3; i++) {
          const call = interceptor(options, nextCall);
          try {
            // Simulate start call
            (call as any).requester.start({}, { onReceiveStatus: () => {} }, () => {});
          } catch {}
        }
      },
      specs => specs.length
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
        } as unknown as typeof realCp;
        const wrapped = driver.wrapChildProcess(mockCp);
        try { wrapped.spawn('ls'); } catch {}
        try { wrapped.exec('ls'); } catch {}
        try { wrapped.fork('script.js'); } catch {}
        await sleep(100); // let the injected kill timers fire
      },
      specs => specs.length
    );
  });

  describe('resource drivers', () => {
    let previousSandboxMode: string | undefined;

    beforeAll(() => {
      previousSandboxMode = process.env.SIBYL_SANDBOX_MODE;
      process.env.SIBYL_SANDBOX_MODE = 'true';
    });

    afterAll(() => {
      if (previousSandboxMode === undefined) delete process.env.SIBYL_SANDBOX_MODE;
      else process.env.SIBYL_SANDBOX_MODE = previousSandboxMode;
    });

    // Each scheduled PRESSURE fault records its start and, once its duration elapses, its end.
    const pressureWorkload = async (driver: CpuFaultDriver | MemoryFaultDriver) => {
      for (let i = 0; i < 3; i++) {
        driver.applyScheduledFault();
        await sleep(150); // longer than any generated durationMs
      }
    };

    it('CPU Driver produces identical CapturedEvents', async () => {
      await assertDeterminism(
        CpuFaultDriver,
        'CPU',
        fc.array(CpuFaultSpecArb, { maxLength: 3 }),
        pressureWorkload,
        specs => specs.length * 2
      );
    });

    it('Memory Driver produces identical CapturedEvents', async () => {
      await assertDeterminism(
        MemoryFaultDriver,
        'MEMORY',
        fc.array(MemoryFaultSpecArb, { maxLength: 3 }),
        pressureWorkload,
        specs => specs.length * 2
      );
    });
  });
});
