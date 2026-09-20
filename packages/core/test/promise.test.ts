import { describe, it, expect } from 'vitest';
import { 
  ProgrammaticPromise, 
  allOf, 
  anyOf, 
  createPromiseContext, 
  executePromise,
  snapshotPromise
} from '../src/promise';
import { CapturedEvent } from '@sibyl-shared';

describe('Promise Framework', () => {
  const mockEvents: CapturedEvent[] = [
    { domain: 'HTTP', timestamp: 100, payload: { method: 'POST', url: '/checkout', statusCode: 200, durationMs: 50 } },
    { domain: 'DATABASE', timestamp: 150, payload: { query: 'INSERT INTO orders', durationMs: 10 } }
  ];

  const ctx = createPromiseContext('test-run', mockEvents);

  it('timeline filters and sorts events correctly', () => {
    // Reverse events to ensure it sorts them
    const unsortedCtx = createPromiseContext('test-run', [...mockEvents].reverse());
    const timeline = unsortedCtx.timeline();
    
    expect(timeline[0].domain).toBe('HTTP');
    expect(timeline[1].domain).toBe('DATABASE');

    const dbEvents = unsortedCtx.timeline(e => e.domain === 'DATABASE');
    expect(dbEvents.length).toBe(1);
    expect(dbEvents[0].domain).toBe('DATABASE');
  });

  it('evaluates a basic programmatic promise', async () => {
    const p: ProgrammaticPromise = {
      id: 'p1',
      description: 'Check HTTP',
      severity: 'HIGH',
      evaluate(ctx) {
        return ctx.timeline(e => e.domain === 'HTTP').length > 0;
      }
    };

    const res = await executePromise(p, ctx, 200);
    expect(res.passed).toBe(true);
    expect(res.severity).toBe('HIGH');
  });

  it('allOf combinator passes when all sub-promises pass', async () => {
    const p1: ProgrammaticPromise = { id: 'p1', description: 't', severity: 'LOW', evaluate: () => true };
    const p2: ProgrammaticPromise = { id: 'p2', description: 't', severity: 'LOW', evaluate: () => true };
    
    const combined = allOf('c1', 'combo', [p1, p2]);
    const res = await executePromise(combined, ctx, 200);
    
    expect(res.passed).toBe(true);
  });

  it('allOf combinator fails when one sub-promise fails', async () => {
    const p1: ProgrammaticPromise = { id: 'p1', description: 't', severity: 'LOW', evaluate: () => true };
    const p2: ProgrammaticPromise = { id: 'p2', description: 't', severity: 'LOW', evaluate: () => false };
    
    const combined = allOf('c1', 'combo', [p1, p2]);
    const res = await executePromise(combined, ctx, 200);
    
    expect(res.passed).toBe(false);
    expect(res.message).toContain('allOf failed: [p2] failed');
  });

  it('anyOf combinator passes when at least one sub-promise passes', async () => {
    const p1: ProgrammaticPromise = { id: 'p1', description: 't', severity: 'LOW', evaluate: () => false };
    const p2: ProgrammaticPromise = { id: 'p2', description: 't', severity: 'LOW', evaluate: () => true };
    
    const combined = anyOf('c1', 'combo', [p1, p2]);
    const res = await executePromise(combined, ctx, 200);
    
    expect(res.passed).toBe(true);
    expect(res.message).toContain('anyOf passed because [p2] passed');
  });

  describe('Session Promises (Cross-run)', () => {
    it('evaluates across multiple runs in SessionPromiseContext', async () => {
      const sessionCtx = {
        runs: [
          { runId: 'r1', passed: true, promiseResults: [], concreteSchedules: [], seed: '1', status: 'COMPLETED' as const },
          { runId: 'r2', passed: false, promiseResults: [], concreteSchedules: [], seed: '2', status: 'FAILED' as const }
        ]
      };

      const p: ProgrammaticPromise = {
        id: 'session-p1',
        description: 'Ensure 50% pass rate',
        severity: 'HIGH',
        scope: 'session',
        evaluate(ctx) {
          if ('runId' in ctx) return false; // Fail if given run context
          
          const passedRuns = ctx.runs.filter(r => r.passed).length;
          return passedRuns >= (ctx.runs.length / 2);
        }
      };

      const res = await executePromise(p, sessionCtx, 200);
      expect(res.passed).toBe(true);
      expect(res.simulationRunId).toBe('SESSION');
    });
  });

  describe('Snapshot Promises', () => {
    const fs = require('fs');
    const path = require('path');
    
    it('generates a snapshot and matches it', async () => {
      const snapshotDir = path.join(process.cwd(), '__snapshots__');
      const snapFile = path.join(snapshotDir, 'snap-test.snap.json');
      
      // Cleanup before
      if (fs.existsSync(snapFile)) fs.unlinkSync(snapFile);

      const p = snapshotPromise('snap-test', 'Test snap', (ctx) => ({ val: 42 }));
      
      const updateCtx = { runId: 'r1', events: [], timeline: () => [], updateSnapshots: true };
      
      // 1. Should create the snapshot
      const res1 = await executePromise(p, updateCtx, 200);
      expect(res1.passed).toBe(true);
      expect(fs.existsSync(snapFile)).toBe(true);
      
      // 2. Should pass matching snapshot
      const checkCtx = { runId: 'r2', events: [], timeline: () => [] };
      const res2 = await executePromise(p, checkCtx, 200);
      expect(res2.passed).toBe(true);
      
      // Cleanup after
      if (fs.existsSync(snapFile)) fs.unlinkSync(snapFile);
    });
  });
});
