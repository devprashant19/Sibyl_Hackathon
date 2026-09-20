import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka, Partitioners } from 'kafkajs';
import { MqFaultDriver } from '../src/index';
import type { DriverContext } from '@sibyl-core';
import { VirtualClock } from '../../../core/src/clock';

describe('Kafka MqFaultDriver Integration', () => {
  let container: StartedKafkaContainer;
  let kafka: Kafka;
  let wrappedKafka: any;
  let driver: MqFaultDriver;
  let clock: VirtualClock;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let dockerAvailable = true;

  beforeAll(async () => {
    try {
      container = await new KafkaContainer('confluentinc/confluent-local:7.5.0').withExposedPorts(9093).start();
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
    
    kafka = new Kafka({
      clientId: 'sibyl-test',
      brokers: [`${container.getHost()}:${container.getMappedPort(9093)}`],
    });

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

    wrappedKafka = driver.wrapKafka(kafka);
  });

  afterEach(async () => {
    driver.uninstall();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it('should pass through messages when no fault is decided', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    
    const producer = wrappedKafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
    await producer.connect();
    
    await producer.send({
      topic: 'test-topic-1',
      messages: [{ value: 'Hello Kafka' }],
    });

    const consumer = wrappedKafka.consumer({ groupId: 'test-group-1' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'test-topic-1', fromBeginning: true });

    let receivedMsg = '';
    
    await new Promise<void>((resolve) => {
      consumer.run({
        eachMessage: async ({ message }: any) => {
          receivedMsg = message.value.toString();
          resolve();
        },
      });
    });

    expect(receivedMsg).toBe('Hello Kafka');
    expect(mockGetFaultDecision).toHaveBeenCalled();

    await producer.disconnect();
    await consumer.disconnect();
  });

  it('should simulate MESSAGE_LOSS on producer', async () => {
    mockGetFaultDecision.mockImplementation((domain: string, meta: any) => {
      if (meta?.topic === 'test-topic-loss') {
        return { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_LOSS' };
      }
      return null;
    });
    
    const producer = wrappedKafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
    await producer.connect();
    
    // This should essentially be swallowed by the wrapper
    await producer.send({
      topic: 'test-topic-loss',
      messages: [{ value: 'Lost message' }],
    });

    const consumer = wrappedKafka.consumer({ groupId: 'test-group-loss' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'test-topic-loss', fromBeginning: true });

    let receivedMsg = null;
    
    consumer.run({
      eachMessage: async ({ message }: any) => {
        receivedMsg = message.value.toString();
      },
    });

    // Wait a bit to ensure no message is received
    await new Promise(r => setTimeout(r, 1000));
    expect(receivedMsg).toBeNull();

    await producer.disconnect();
    await consumer.disconnect();
  });
});
