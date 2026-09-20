import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { LocalstackContainer, StartedLocalstackContainer } from '@testcontainers/localstack';
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { MqFaultDriver } from '../src/index';
import type { DriverContext } from '@sibyl-core';
import { VirtualClock } from '../../../core/src/clock';

describe('SQS MqFaultDriver Integration', () => {
  let container: StartedLocalstackContainer;
  let sqs: SQSClient;
  let wrappedSqs: SQSClient;
  let driver: MqFaultDriver;
  let clock: VirtualClock;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let dockerAvailable = true;
  let queueUrl: string;

  beforeAll(async () => {
    try {
      container = await new LocalstackContainer('localstack/localstack:3.0.0').start();
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
    
    sqs = new SQSClient({
      endpoint: container.getConnectionUri(),
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });

    const createQ = await sqs.send(new CreateQueueCommand({ QueueName: `test-queue-${Date.now()}` }));
    queueUrl = createQ.QueueUrl!;

    clock = new VirtualClock();
    clock.install({ mode: 'real-time' });

    driver = new MqFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();

    driver.install({
      clock,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent,
      prng: { next: () => Math.random() } as any
    });

    wrappedSqs = driver.wrapSqsClient(sqs);
  });

  afterEach(async () => {
    driver.uninstall();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it('should pass through messages when no fault is decided', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    
    await wrappedSqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: 'Hello SQS',
    }));

    const response = await wrappedSqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1
    }));

    expect(response.Messages).toBeDefined();
    expect(response.Messages![0].Body).toBe('Hello SQS');
    expect(mockGetFaultDecision).toHaveBeenCalled();
  });

  it('should duplicate message on MESSAGE_DUPLICATE fault', async () => {
    mockGetFaultDecision.mockImplementation((domain: string, meta: any) => {
      // Trigger fault ONLY on receive
      if (meta?.operation === 'ReceiveMessage') {
        return { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_DUPLICATE' };
      }
      return null;
    });
    
    await wrappedSqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: 'Duplicate me',
    }));

    const response = await wrappedSqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 1
    }));

    // SQS Wrapper duplicates the message array if fault is triggered
    expect(response.Messages).toBeDefined();
    expect(response.Messages).toHaveLength(2);
    expect(response.Messages![0].Body).toBe('Duplicate me');
    expect(response.Messages![1].Body).toBe('Duplicate me');
  });
});
