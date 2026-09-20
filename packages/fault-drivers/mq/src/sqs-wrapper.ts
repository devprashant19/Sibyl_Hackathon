import type { MqFaultDriver } from './index';

export function wrapSqsClient(client: any, driver: MqFaultDriver): any {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        return async (command: any, options?: any) => {
          if (!driver.context) return target.send(command, options);

          const commandName = command.constructor.name;
          
          // Producer Side
          if (commandName === 'SendMessageCommand') {
            const topic = command.input.QueueUrl;
            
            const fault = driver.context.getFaultDecision('MESSAGE_QUEUE', {
              topic,
            });

            if (!fault) return target.send(command, options);

            driver.context.recordEvent({
              domain: 'MESSAGE_QUEUE',
              payload: { topic, messageId: command.input.MessageDeduplicationId || 'unknown' }
            } as any);

            const faultAny = fault as any;

            if (fault.type === 'MESSAGE_LOSS') {
              return {
                MessageId: 'mock-lost-message-id',
                MD5OfMessageBody: 'mock',
              };
            }

            if (fault.type === 'MESSAGE_DELAY') {
              const delay = faultAny.delayMs || 5000;
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            if (fault.type === 'OUT_OF_ORDER_DELIVERY') {
              await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            }
          }

          // Consumer Side - Receive
          if (commandName === 'ReceiveMessageCommand') {
            const topic = command.input.QueueUrl;
            
            const fault = driver.context.getFaultDecision('MESSAGE_QUEUE', {
              topic,
            });

            const res = await target.send(command, options);
            if (!fault || !res.Messages || res.Messages.length === 0) return res;

            driver.context.recordEvent({
              domain: 'MESSAGE_QUEUE',
              payload: { topic, messageId: res.Messages[0]?.MessageId || 'unknown' }
            } as any);

            if (fault.type === 'MESSAGE_DUPLICATE') {
              const msg = res.Messages[0];
              // Provide a duplicate of the first message to the consumer
              res.Messages.push({ ...msg, MessageId: msg.MessageId + '-dup' });
              return res;
            }
            
            return res;
          }

          // Consumer Side - ACK (Delete)
          if (commandName === 'DeleteMessageCommand') {
            const topic = command.input.QueueUrl;
            const fault = driver.context.getFaultDecision('MESSAGE_QUEUE', { topic });
            
            if (fault && fault.type === 'CONSUMER_CRASH_MID_PROCESSING') {
              // Simulate a consumer crashing before the ACK finishes by intentionally NOT sending the DeleteMessageCommand to AWS.
              // The message will stay in-flight and become visible again according to its VisibilityTimeout.
              return {}; // Fake successful ACK to the local caller, but AWS didn't receive it!
            }
          }

          return target.send(command, options);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
