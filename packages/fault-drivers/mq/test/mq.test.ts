import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MqFaultDriver } from '../src/index';

// Mirrors the AWS SDK: the wrapper dispatches on the command's class name.
class SendMessageCommand { constructor(public input: any) {} }
class ReceiveMessageCommand { constructor(public input: any) {} }

describe('MqFaultDriver (unit)', () => {
  let driver: MqFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    driver = new MqFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();
    driver.install({
      clock: {} as any,
      prng: { next: () => 0 } as any,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent,
    });
  });

  it('SQS: OUT_OF_ORDER_DELIVERY on send uses the context PRNG and still sends', async () => {
    mockGetFaultDecision.mockReturnValue({ domain: 'MESSAGE_QUEUE', type: 'OUT_OF_ORDER_DELIVERY' });
    const client = { send: vi.fn(async () => ({ MessageId: 'real' })) };

    const res = await driver.wrapSqsClient(client).send(new SendMessageCommand({ QueueUrl: 'q', MessageBody: 'm' }));

    expect(res).toEqual({ MessageId: 'real' });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
  });

  it('SQS: passes the operation in the fault metadata so faults can target receive only', async () => {
    mockGetFaultDecision.mockImplementation((domain: string, meta: any) =>
      meta.operation === 'ReceiveMessage' ? { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_DUPLICATE' } : null
    );
    const client = {
      send: vi.fn(async (command: any) =>
        command instanceof ReceiveMessageCommand ? { Messages: [{ MessageId: '1', Body: 'hi' }] } : { MessageId: '1' }
      ),
    };
    const sqs = driver.wrapSqsClient(client);

    await sqs.send(new SendMessageCommand({ QueueUrl: 'q', MessageBody: 'hi' }));
    const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: 'q' }));

    expect(mockGetFaultDecision).toHaveBeenCalledWith('MESSAGE_QUEUE', { topic: 'q', operation: 'SendMessage' });
    expect(mockGetFaultDecision).toHaveBeenCalledWith('MESSAGE_QUEUE', { topic: 'q', operation: 'ReceiveMessage' });
    expect(res.Messages.map((m: any) => m.Body)).toEqual(['hi', 'hi']);
  });

  it("Kafka: OUT_OF_ORDER_DELIVERY reorders a copy, not the caller's messages array", async () => {
    mockGetFaultDecision.mockReturnValue({ domain: 'MESSAGE_QUEUE', type: 'OUT_OF_ORDER_DELIVERY' });
    const send = vi.fn(async () => []);
    const kafka = { producer: () => ({ send }) };
    const record = { topic: 't', messages: [{ value: '1' }, { value: '2' }, { value: '3' }] };

    await driver.wrapKafka(kafka).producer().send(record);

    expect(send.mock.calls[0][0].messages.map((m: any) => m.value)).toEqual(['3', '2', '1']);
    expect(record.messages.map(m => m.value)).toEqual(['1', '2', '3']);
  });
});
