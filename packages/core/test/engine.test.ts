import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/engine';
import { FaultDriver, DriverContext } from '../src/driver';
import { SimulationRun, FaultDomain } from '@sibyl-shared';

class MockDriver implements FaultDriver {
  context?: DriverContext;
  constructor(public domain: FaultDomain) {}

  install(context: DriverContext) {
    this.context = context;
  }

  uninstall() {
    this.context = undefined;
  }

  simulateOperation(metadata: Record<string, any>) {
    return this.context?.getFaultDecision(this.domain, metadata);
  }
}

describe('Simulation Engine Determinism', () => {
  const createRun = (): SimulationRun => ({
    id: 'test-run-1',
    environment: 'LOCAL_PROCESS',
    status: 'PENDING',
    schedules: [
      {
        id: 's1',
        probability: 0.5,
        spec: { domain: 'HTTP', type: 'TIMEOUT' }
      },
      {
        id: 's2',
        probability: 0.5,
        spec: { domain: 'DATABASE', type: 'DEADLOCK' }
      },
      {
        id: 's3',
        probability: 0.5,
        spec: { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_DUPLICATE' }
      }
    ]
  });

  const simulateWorkload = (engine: SimulationEngine, http: MockDriver, db: MockDriver, mq: MockDriver) => {
    engine.start();
    const results = [];
    
    // Simulate a workflow where 10 operations of each type happen
    for (let i = 0; i < 10; i++) {
      results.push(http.simulateOperation({ method: 'GET' })?.type || 'OK');
      results.push(db.simulateOperation({ query: 'SELECT' })?.type || 'OK');
      results.push(mq.simulateOperation({ topic: 'events' })?.type || 'OK');
    }
    
    engine.stop();
    return results;
  };

  it('resolves deterministically across all domains from a single top-level seed', () => {
    const run1 = createRun();
    const engine1 = new SimulationEngine(run1, 'master-seed-42');
    const http1 = new MockDriver('HTTP');
    const db1 = new MockDriver('DATABASE');
    const mq1 = new MockDriver('MESSAGE_QUEUE');
    engine1.installDriver(http1);
    engine1.installDriver(db1);
    engine1.installDriver(mq1);

    const run2 = createRun();
    const engine2 = new SimulationEngine(run2, 'master-seed-42');
    const http2 = new MockDriver('HTTP');
    const db2 = new MockDriver('DATABASE');
    const mq2 = new MockDriver('MESSAGE_QUEUE');
    engine2.installDriver(http2);
    engine2.installDriver(db2);
    engine2.installDriver(mq2);

    const results1 = simulateWorkload(engine1, http1, db1, mq1);
    const results2 = simulateWorkload(engine2, http2, db2, mq2);

    // They must be identical
    expect(results1).toEqual(results2);

    // Ensure it's actually injecting faults and not just all OK
    const hasFaults = results1.some(r => r !== 'OK');
    expect(hasFaults).toBe(true);

    // Now test a DIFFERENT seed and ensure it produces a DIFFERENT sequence
    const run3 = createRun();
    const engine3 = new SimulationEngine(run3, 'master-seed-99');
    const http3 = new MockDriver('HTTP');
    const db3 = new MockDriver('DATABASE');
    const mq3 = new MockDriver('MESSAGE_QUEUE');
    engine3.installDriver(http3);
    engine3.installDriver(db3);
    engine3.installDriver(mq3);

    const results3 = simulateWorkload(engine3, http3, db3, mq3);
    expect(results3).not.toEqual(results1);
  });

  it('domain RNG streams are perfectly independent', () => {
    const run1 = createRun();
    const engine1 = new SimulationEngine(run1, 'test-seed');
    const http1 = new MockDriver('HTTP');
    const db1 = new MockDriver('DATABASE');
    
    engine1.installDriver(http1);
    engine1.installDriver(db1);

    // If we only query HTTP, the DB's future results shouldn't be affected by HTTP's advancement
    engine1.start();
    const httpResult1 = http1.simulateOperation({ method: 'GET' })?.type || 'OK';
    const dbResult1 = db1.simulateOperation({ query: 'SELECT' })?.type || 'OK';
    engine1.stop();

    const run2 = createRun();
    const engine2 = new SimulationEngine(run2, 'test-seed');
    const http2 = new MockDriver('HTTP');
    const db2 = new MockDriver('DATABASE');
    
    // Install in REVERSE order to prove order-independence
    engine2.installDriver(db2);
    engine2.installDriver(http2);
    
    engine2.start();
    // In run 2, query DB FIRST
    const dbResult2 = db2.simulateOperation({ query: 'SELECT' })?.type || 'OK';
    const httpResult2 = http2.simulateOperation({ method: 'GET' })?.type || 'OK';
    engine2.stop();

    expect(dbResult1).toEqual(dbResult2);
    expect(httpResult1).toEqual(httpResult2);
  });
});
