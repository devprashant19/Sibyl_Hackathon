import { Kafka } from 'kafkajs';
import { MqFaultDriver } from '@sibyl-fault-drivers/mq';
import { DriverContext } from '../src/driver';
import { VirtualClock } from '../src/clock';

// Mock DB
const db = {
  users: [{ id: 'u1', balance: 100 }],
  updateBalance: async (id: string, amount: number) => {
    const user = db.users.find(u => u.id === id);
    if (user) user.balance += amount;
  }
};

async function runExample() {
  console.log('Starting Webhook Idempotency Example...');
  
  // 1. Setup Fault Injection Driver
  const clock = new VirtualClock();
  clock.install({ mode: 'real-time' });

  const mqDriver = new MqFaultDriver();
  
  // Hardcode a schedule for testing: 100% chance of duplicating the webhook message
  const mockContext: DriverContext = {
    clock,
    getFaultDecision: (domain, metadata) => {
      if (domain === 'MESSAGE_QUEUE' && metadata.topic === 'stripe-webhooks') {
        console.log(`[Sibyl Engine] Injecting MESSAGE_DUPLICATE for topic: ${metadata.topic}`);
        return {
          domain: 'MESSAGE_QUEUE',
          type: 'MESSAGE_DUPLICATE',
        };
      }
      return null;
    },
    recordEvent: (event) => {
      console.log(`[Sibyl Telemetry] Event recorded: ${JSON.stringify(event.payload)}`);
    }
  };
  
  mqDriver.install(mockContext);

  // 2. Wrap Kafka Client
  const rawKafka = new Kafka({
    clientId: 'example-app',
    brokers: ['localhost:9092']
  });
  
  const kafka = mqDriver.wrapKafka(rawKafka);

  // 3. User's Producer
  const producer = kafka.producer();
  
  // Mock producer behavior since we don't have a real Kafka broker running for this script
  producer.send = async (record: any) => {
    console.log(`[Producer] Sending webhook for $50 to ${record.topic}`);
    return [{ topicName: record.topic, partition: 0, errorCode: 0, baseOffset: '0' }];
  };

  // 4. User's Consumer (Vulnerable to duplicates)
  const consumer = kafka.consumer({ groupId: 'webhook-group' });
  
  // Mock consumer run
  consumer.run = async (config: any) => {
    const message = {
      key: 'evt_123',
      value: JSON.stringify({ userId: 'u1', amount: 50, type: 'payment_success' })
    };
    
    // Simulate Kafka polling the broker and passing it to eachMessage
    await config.eachMessage({
      topic: 'stripe-webhooks',
      partition: 0,
      message
    });
  };

  // User's Handler Logic (Non-idempotent)
  await consumer.run({
    eachMessage: async ({ message }: any) => {
      const payload = JSON.parse(message.value.toString());
      console.log(`[Consumer] Processing webhook: Add $${payload.amount} to ${payload.userId}`);
      
      // BUG: Doesn't check if evt_123 was already processed!
      await db.updateBalance(payload.userId, payload.amount);
    }
  });

  // Trigger the flow
  await producer.send({
    topic: 'stripe-webhooks',
    messages: [{ key: 'evt_123', value: JSON.stringify({ userId: 'u1', amount: 50 }) }]
  });

  // Allow asynchronous events to settle
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('--- Results ---');
  console.log(`Expected User Balance: $150 (Started with $100, Added $50)`);
  console.log(`Actual User Balance:   $${db.users[0].balance}`);

  // 5. Evaluate the "Promise"
  const promisePassed = db.users[0].balance === 150;
  if (!promisePassed) {
    console.error(`[Sibyl Promise Failed] The system is vulnerable to double-spend on webhook duplication!`);
    process.exit(1);
  } else {
    console.log(`[Sibyl Promise Passed] The system successfully handled the duplicate.`);
  }
}

runExample().catch(console.error);
