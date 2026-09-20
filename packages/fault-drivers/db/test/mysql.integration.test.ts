import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import { DatabaseFaultDriver } from '../src/index';
import type { DriverContext } from '@sibyl-core';
import { VirtualClock } from '../../../core/src/clock';

describe('MySQL DatabaseFaultDriver Integration', () => {
  let container: StartedMySqlContainer;
  let pool: mysql.Pool;
  let wrappedPool: mysql.Pool;
  let driver: DatabaseFaultDriver;
  let clock: VirtualClock;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let dockerAvailable = true;

  beforeAll(async () => {
    try {
      container = await new MySqlContainer('mysql:8.0').start();
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
    pool = mysql.createPool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getUserPassword(),
    });

    await pool.query('CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50))');
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

    wrappedPool = driver.wrapMysql2Pool(pool);
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
    driver.uninstall();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it('should pass through queries when no fault is decided', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const connection = await wrappedPool.getConnection();
    
    await connection.query('INSERT INTO users (name) VALUES (?)', ['Alice']);
    const [rows] = await connection.query('SELECT * FROM users');
    
    expect(rows).toHaveLength(1);
    expect((rows as any)[0].name).toBe('Alice');

    expect(mockGetFaultDecision).toHaveBeenCalledWith('DATABASE', expect.objectContaining({
      query: 'INSERT INTO users (name) VALUES (?)',
      table: 'users',
    }));

    connection.release();
  });

  it('should throw MySQL DEADLOCK (ER_LOCK_DEADLOCK 1213)', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'DATABASE',
      type: 'DEADLOCK'
    });

    const connection = await wrappedPool.getConnection();

    try {
      await connection.query('UPDATE users SET name = ?', ['Bob']);
      expect.fail('Should have thrown deadlock error');
    } catch (e: any) {
      expect(e.message).toMatch(/deadlock/i);
      expect(e.code).toBe('ER_LOCK_DEADLOCK');
    }

    connection.release();
  });

  it('should support SLOW_QUERY', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'DATABASE',
      type: 'SLOW_QUERY',
      delayMs: 100
    });

    const connection = await wrappedPool.getConnection();
    const start = Date.now();
    await connection.query('SELECT * FROM users');
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(90);

    connection.release();
  });
});
