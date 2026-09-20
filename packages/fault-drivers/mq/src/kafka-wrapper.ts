import type { MqFaultDriver } from './index';

export function wrapKafka(kafka: any, driver: MqFaultDriver): any {
  return new Proxy(kafka, {
    get(target, prop, receiver) {
      if (prop === 'producer') {
        return (...args: any[]) => {
          const producer = target.producer(...args);
          return wrapProducer(producer, driver);
        };
      }
      if (prop === 'consumer') {
        return (...args: any[]) => {
          const consumer = target.consumer(...args);
          return wrapConsumer(consumer, driver);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapProducer(producer: any, driver: MqFaultDriver): any {
  return new Proxy(producer, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        return async (record: any) => {
          if (!driver.context) return target.send(record);

          const fault = driver.context.getFaultDecision('MESSAGE_QUEUE', {
            topic: record.topic,
          });

          if (!fault) return target.send(record);

          driver.context.recordEvent({
            domain: 'MESSAGE_QUEUE',
            payload: { topic: record.topic, messageId: 'producer-send' }
          } as any);

          const faultAny = fault as any;

          if (fault.type === 'MESSAGE_LOSS') {
            return [{ topicName: record.topic, partition: 0, errorCode: 0, baseOffset: '0' }];
          }

          if (fault.type === 'MESSAGE_DELAY') {
            const delay = faultAny.delayMs || 5000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return target.send(record);
          }

          if (fault.type === 'OUT_OF_ORDER_DELIVERY') {
            if (record.messages && record.messages.length > 1) {
              record.messages.reverse();
            } else {
              // Artificial random jitter to disrupt sequence, using deterministic prng
              await new Promise(resolve => setTimeout(resolve, driver.context!.prng.next() * 50));
            }
            return target.send(record);
          }

          return target.send(record);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapConsumer(consumer: any, driver: MqFaultDriver): any {
  return new Proxy(consumer, {
    get(target, prop, receiver) {
      if (prop === 'run') {
        return async (config: any) => {
          if (!config || !config.eachMessage) return target.run(config);

          const originalEachMessage = config.eachMessage;
          config.eachMessage = async (payload: any) => {
            if (!driver.context) return originalEachMessage(payload);

            const fault = driver.context.getFaultDecision('MESSAGE_QUEUE', {
              topic: payload.topic,
            });

            if (!fault) return originalEachMessage(payload);

            driver.context.recordEvent({
              domain: 'MESSAGE_QUEUE',
              payload: { topic: payload.topic, messageId: payload.message?.key?.toString() || 'unknown' }
            } as any);

            if (fault.type === 'MESSAGE_DUPLICATE') {
              await originalEachMessage(payload);
              // Wait slightly and redeliver
              await new Promise(resolve => setTimeout(resolve, 10));
              return originalEachMessage(payload);
            }

            if (fault.type === 'CONSUMER_CRASH_MID_PROCESSING') {
              // Race the execution against a simulated crash
              return Promise.race([
                originalEachMessage(payload),
                new Promise((_, reject) => setTimeout(() => {
                  reject(new Error('Simulated CONSUMER_CRASH_MID_PROCESSING: Process died before acking'));
                }, 10))
              ]);
            }

            return originalEachMessage(payload);
          };

          return target.run(config);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
