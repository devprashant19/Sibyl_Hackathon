import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockQueueAdd,
  mockSetnx,
  mockGet,
  mockSet,
  mockDel,
  mockPublish,
  state
} = vi.hoisted(() => ({
  mockQueueAdd: vi.fn(),
  mockSetnx: vi.fn(),
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDel: vi.fn(),
  mockPublish: vi.fn(),
  state: { 
    workerHandler: null as Function | null, 
    workerFailHandler: null as Function | null,
    sandboxCrash: false
  }
}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(queue: string, handler: Function) {
      state.workerHandler = handler;
    }
    on(event: string, callback: Function) {
      if (event === 'failed') state.workerFailHandler = callback;
    }
    close() {}
  },
  Queue: class {
    add = mockQueueAdd;
    close() {}
  }
}));

vi.mock('@sibyl-core', () => ({
  simulationRunQueue: { add: mockQueueAdd },
  deadLetterQueue: { add: mockQueueAdd },
  connection: {
    setnx: mockSetnx,
    get: mockGet,
    set: mockSet,
    del: mockDel,
  },
  DockerSandboxProvider: class {
    async createSandbox() {
      return {
        start: vi.fn().mockImplementation(async () => {
          if (state.sandboxCrash) throw new Error('Sandbox crash');
        }),
        stop: vi.fn(),
        cleanup: vi.fn()
      };
    }
  }
}));

vi.mock('ioredis', () => ({
  default: class {
    publish = mockPublish;
  }
}));

// Load the worker (which registers the handler)
import '../src/index';

describe('Worker Job Orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sandboxCrash = false;
  });

  const simulateJob = async (behavior: 'success' | 'fail', attemptsMade = 1) => {
    const job = {
      id: 'test-job-1',
      data: { runId: 'run-123', orgId: 'org-1' },
      opts: { attempts: 3 },
      attemptsMade,
      updateProgress: vi.fn()
    };
    try {
      if (behavior === 'fail') {
         state.sandboxCrash = true;
      }
      if (state.workerHandler) {
        await state.workerHandler(job);
      }
    } catch (e) {
      if (state.workerFailHandler) {
        await state.workerFailHandler(job, e as Error);
      }
    }
  };

  it('should enforce idempotency and skip already completed jobs', async () => {
    mockSetnx.mockResolvedValueOnce(0); // Key exists
    mockGet.mockResolvedValueOnce('COMPLETED'); // Already completed
    
    await simulateJob('success');

    expect(mockSetnx).toHaveBeenCalledWith('sibyl:run:run-123:status', 'PROCESSING');
    expect(mockSet).not.toHaveBeenCalledWith('sibyl:run:run-123:status', 'COMPLETED');
  });

  it('should clean up idempotency key on failure for safe retry', async () => {
    mockSetnx.mockResolvedValueOnce(1); // Acquired lock
    
    await simulateJob('fail');

    expect(mockDel).toHaveBeenCalledWith('sibyl:run:run-123:status');
  });

  it('should move job to dead letter queue when retries are exhausted', async () => {
    mockSetnx.mockResolvedValueOnce(1); // Acquired lock
    
    await simulateJob('fail', 3); // 3 attempts made, opts.attempts is 3

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'dlq-test-job-1',
      { runId: 'run-123', orgId: 'org-1' },
      { jobId: 'dlq-test-job-1' }
    );
  });
});
