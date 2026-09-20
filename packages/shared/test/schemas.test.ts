import { describe, it, expect } from 'vitest';
import {
  FaultSpecSchema,
  SimulationRunSchema,
  CapturedEventSchema,
} from '../src/schemas';

describe('FaultSpecSchema Validation', () => {
  it('validates HTTP faults', () => {
    const spec = { domain: 'HTTP', type: 'HTTP_5XX', status: 503 };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
    
    // Invalid type
    expect(() => FaultSpecSchema.parse({ domain: 'HTTP', type: 'DEADLOCK' })).toThrow();
  });

  it('validates DATABASE faults', () => {
    const spec = { domain: 'DATABASE', type: 'DEADLOCK' };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates MESSAGE_QUEUE faults', () => {
    const spec = { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_LOSS' };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates GRPC faults', () => {
    const spec = { domain: 'GRPC', type: 'DEADLINE_EXCEEDED' };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates FILESYSTEM faults', () => {
    const spec = { domain: 'FILESYSTEM', type: 'DISK_FULL' };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates CLOCK faults', () => {
    const spec = { domain: 'CLOCK', type: 'CLOCK_SKEW', offsetMs: 1000 };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates PROCESS faults', () => {
    const spec = { domain: 'PROCESS', type: 'OOM_KILL' };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates MEMORY faults', () => {
    const spec = { domain: 'MEMORY', type: 'PRESSURE', percentage: 90, durationMs: 5000 };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
  });

  it('validates CPU faults', () => {
    const spec = { domain: 'CPU', type: 'PRESSURE', percentage: 100, durationMs: 10000 };
    expect(FaultSpecSchema.parse(spec)).toEqual(spec);
    
    // Invalid percentage
    expect(() => FaultSpecSchema.parse({ domain: 'CPU', type: 'PRESSURE', percentage: 150, durationMs: 1000 })).toThrow();
  });
});

describe('SimulationRunSchema Cross-Domain Validation', () => {
  it('validates a run containing multiple different domain faults', () => {
    const run = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      environment: 'LOCAL_PROCESS',
      status: 'RUNNING',
      schedules: [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          spec: { domain: 'HTTP', type: 'TIMEOUT' },
          probability: 0.5,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          spec: { domain: 'DATABASE', type: 'CONNECTION_DROP' },
          probability: 0.1,
        }
      ]
    };
    
    expect(SimulationRunSchema.parse(run)).toEqual(run);
  });
});

describe('CapturedEventSchema Validation', () => {
  it('validates domain specific payloads', () => {
    const httpEvent = {
      domain: 'HTTP',
      timestamp: 1620000000000,
      payload: { method: 'GET', url: '/api', statusCode: 200, durationMs: 50 }
    };
    expect(CapturedEventSchema.parse(httpEvent)).toEqual(httpEvent);

    const dbEvent = {
      domain: 'DATABASE',
      timestamp: 1620000000000,
      payload: { query: 'SELECT 1', durationMs: 5 }
    };
    expect(CapturedEventSchema.parse(dbEvent)).toEqual(dbEvent);
    
    // Mismatched payload
    expect(() => CapturedEventSchema.parse({
      domain: 'HTTP',
      timestamp: 1620000000000,
      payload: { query: 'SELECT 1', durationMs: 5 }
    })).toThrow();
  });
});
