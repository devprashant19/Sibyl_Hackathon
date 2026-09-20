import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { DatabaseFaultDriver } from '../src/index';
import { VirtualClock, DriverContext } from '@sibyl-core';

describe('Postgres DatabaseFaultDriver Integration', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let wrappedPool: Pool;
  let driver: DatabaseFaultDriver;
  let clock: VirtualClock;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let dockerAvailable = true;

  // High timeout for downloading the image on the first run
  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:15-alpine').start();
    } catch (err: any) {
      if (err.message?.includes('Could not find a working container runtime')) {
        console.warn('Docker is not available. Skipping integration tests.');
        dockerAvailable = false;
      } else {
        throw err;
      }
    }
  }, 120000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  beforeEach(async (ctx) => {
    if (!dockerAvailable) {
      ctx.skip();
      return;
    }
    pool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    // Setup dummy table
    await pool.query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(50))');
    await pool.query('TRUNCATE TABLE users');

    clock = new VirtualClock();
    clock.install({ mode: 'real-time' });

    driver = new DatabaseFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();

    driver.install({
      clock,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent,
    });

    wrappedPool = driver.wrapPgPool(pool);
  });

  afterEach(async () => {
    await pool.end();
    driver.uninstall();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it('should pass through queries when no fault is decided', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const client = await wrappedPool.connect();
    
    await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
    const res = await client.query('SELECT * FROM users');
    
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].name).toBe('Alice');

    // It should have extracted the table name
    expect(mockGetFaultDecision).toHaveBeenCalledWith('DATABASE', expect.objectContaining({
      query: 'INSERT INTO users (name) VALUES ($1)',
      table: 'users',
    }));

    client.release();
  });

  it('should extract sibyl-label from query comments', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const client = await wrappedPool.connect();
    
    await client.query('/* sibyl-label: fetch_users */ SELECT * FROM users');
    
    expect(mockGetFaultDecision).toHaveBeenCalledWith('DATABASE', expect.objectContaining({
      labels: ['fetch_users'],
      table: 'users'
    }));

    client.release();
  });

  it('should throw Postgres DEADLOCK (40P01)', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'DATABASE',
      type: 'DEADLOCK'
    });

    const client = await wrappedPool.connect();

    try {
      await client.query('UPDATE users SET name = $1', ['Bob']);
      expect.fail('Should have thrown deadlock error');
    } catch (e: any) {
      expect(e.message).toMatch(/deadlock/i);
      expect(e.code).toBe('40P01');
    }

    client.release();
  });

  it('should throw QUERY_TIMEOUT (57014)', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'DATABASE',
      type: 'QUERY_TIMEOUT',
      delayMs: 50
    });

    const client = await wrappedPool.connect();
    const start = performance.now();

    try {
      await client.query('SELECT * FROM users');
      expect.fail('Should have thrown timeout error');
    } catch (e: any) {
      expect(e.message).toMatch(/timeout/i);
      expect(e.code).toBe('57014');
    }

    const duration = performance.now() - start;
    expect(duration).toBeGreaterThanOrEqual(40);

    client.release();
  });

  it('should support SLOW_QUERY', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'DATABASE',
      type: 'SLOW_QUERY',
      delayMs: 100
    });

    const client = await wrappedPool.connect();
    const start = performance.now();
    await client.query('SELECT * FROM users');
    const duration = performance.now() - start;

    expect(duration).toBeGreaterThanOrEqual(90);

    client.release();
  });

  it('should execute PARTIAL_COMMIT on the second statement of a transaction', async () => {
    // We only fail on the second modifying query in a transaction
    mockGetFaultDecision.mockImplementation((domain, metadata) => {
      // Returning PARTIAL_COMMIT always. The driver should only trigger it on statementsInTx === 1
      return { domain: 'DATABASE', type: 'PARTIAL_COMMIT' };
    });

    const client = await wrappedPool.connect();

    try {
      await client.query('BEGIN');
      // statementsInTx = 0
      await client.query("INSERT INTO users (name) VALUES ('Tx1')"); 
      
      // statementsInTx = 1 (should fail here!)
      await client.query("INSERT INTO users (name) VALUES ('Tx2')"); 
      
      expect.fail('Should have dropped connection on 2nd statement');
    } catch (e: any) {
      expect(e.code).toBe('08006'); // connection dropped
      await client.query('ROLLBACK'); // App handles rollback
    }

    const res = await pool.query('SELECT * FROM users');
    // The transaction rolled back, so NO users should be in the DB!
    expect(res.rows).toHaveLength(0);

    client.release();
  });
});
