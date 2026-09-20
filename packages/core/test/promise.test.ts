import { describe, it, expect } from 'vitest';
import { 
  ProgrammaticPromise, 
  allOf, 
  anyOf, 
  createPromiseContext, 
  executePromise 
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
});
