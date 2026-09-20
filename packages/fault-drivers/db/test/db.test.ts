import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { DatabaseFaultDriver } from '../src/index';

// Callback-API mysql2 shape: query() returns a Query emitter, and rows only arrive via the callback.
function mysqlCallbackConnection() {
  return {
    query: vi.fn((sql: string, ...rest: any[]) => {
      const cb = typeof rest[rest.length - 1] === 'function' ? rest.pop() : undefined;
      if (cb) setImmediate(() => cb(null, [{ id: 1 }], [{ name: 'id' }]));
      return new EventEmitter();
    }),
    release: vi.fn(),
  };
}

describe('DatabaseFaultDriver (unit)', () => {
  let driver: DatabaseFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    driver = new DatabaseFaultDriver();
    mockGetFaultDecision = vi.fn(() => null);
    mockRecordEvent = vi.fn();
    driver.install({
      clock: {} as any,
      prng: {} as any,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent,
    });
  });

  it('PARTIAL_COMMIT lets the first statement after BEGIN succeed and fails the second', async () => {
    mockGetFaultDecision.mockReturnValue({ domain: 'DATABASE', type: 'PARTIAL_COMMIT' });
    const rawClient = { query: vi.fn(async () => ({ rows: [] })) };
    const client = await driver.wrapPgPool({ connect: async () => rawClient }).connect();

    await client.query('BEGIN');
    await client.query("INSERT INTO t VALUES (1)");
    await expect(client.query("INSERT INTO t VALUES (2)")).rejects.toMatchObject({ code: '08006' });

    expect(rawClient.query.mock.calls.map(c => c[0])).toEqual(['BEGIN', 'INSERT INTO t VALUES (1)']);
    expect(mockGetFaultDecision.mock.calls.map(c => c[1].statementsInTx)).toEqual([0, 0, 1]);
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
  });

  it('pg: callback-form pool.connect(cb) hands back a wrapped client', async () => {
    const rawClient = { query: vi.fn(async () => ({ rows: [] })) };
    const pool = { connect: (cb: Function) => setImmediate(() => cb(null, rawClient, () => {})) };

    const client: any = await new Promise((resolve, reject) => {
      driver.wrapPgPool(pool).connect((err: any, c: any) => (err ? reject(err) : resolve(c)));
    });

    mockGetFaultDecision.mockReturnValue({ domain: 'DATABASE', type: 'DEADLOCK' });
    await expect(client.query('SELECT 1')).rejects.toMatchObject({ code: '40P01' });
  });

  it('mysql2: callback-style query receives rows and fields, not the Query emitter', async () => {
    const pool = driver.wrapMysql2Pool(mysqlCallbackConnection());

    const [rows, fields] = await new Promise<any[]>((resolve, reject) => {
      pool.query('SELECT 1', (err: any, r: any, f: any) => (err ? reject(err) : resolve([r, f])));
    });
    expect(rows).toEqual([{ id: 1 }]);
    expect(fields).toEqual([{ name: 'id' }]);

    mockGetFaultDecision.mockReturnValue({ domain: 'DATABASE', type: 'SLOW_QUERY', delayMs: 5 });
    const slowRows = await new Promise(resolve => pool.query('SELECT 1', (_: any, r: any) => resolve(r)));
    expect(slowRows).toEqual([{ id: 1 }]);
  });

  it('mysql2: callback-form getConnection(cb) works and injected errors reach the callback', async () => {
    const rawConn = mysqlCallbackConnection();
    const pool = { getConnection: (cb: Function) => setImmediate(() => cb(null, rawConn)) };

    const conn: any = await new Promise((resolve, reject) => {
      driver.wrapMysql2Pool(pool).getConnection((err: any, c: any) => (err ? reject(err) : resolve(c)));
    });

    mockGetFaultDecision.mockReturnValue({ domain: 'DATABASE', type: 'DEADLOCK' });
    const err: any = await new Promise(resolve => conn.query('UPDATE t SET a = 1', (e: any) => resolve(e)));
    expect(err.code).toBe('ER_LOCK_DEADLOCK');
    expect(rawConn.query).not.toHaveBeenCalled();
  });
});
