import {
  SearchOrchestrator,
  type DriverContext,
  type FaultDriver,
  type ProgrammaticPromise,
} from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';

/**
 * A non-idempotent webhook consumer, found by fault injection.
 *
 *   cd packages/core && npx tsx examples/webhook-idempotency.ts
 *
 * An in-memory broker stands in for Kafka. A fault driver wraps its `publish`: when the search
 * schedules MESSAGE_QUEUE/MESSAGE_DUPLICATE for the topic, the message is delivered twice (as
 * at-least-once brokers do after a lost acknowledgement). The consumer adds the payment on every
 * delivery, so a duplicate double-credits the user. Exits 1 when the promise is broken.
 */

type Handler = (message: { key: string; value: string }) => Promise<void>;

class InMemoryBroker {
  private handlers = new Map<string, Handler[]>();

  subscribe(topic: string, handler: Handler) {
    this.handlers.set(topic, [...(this.handlers.get(topic) ?? []), handler]);
  }

  async publish(topic: string, message: { key: string; value: string }) {
    for (const handler of this.handlers.get(topic) ?? []) await handler(message);
  }
}

/** Wraps a broker's publish so the search can duplicate deliveries. */
class BrokerFaultDriver implements FaultDriver {
  readonly domain = 'MESSAGE_QUEUE' as const;
  private originalPublish?: InMemoryBroker['publish'];

  constructor(private broker: InMemoryBroker) {}

  install(ctx: DriverContext) {
    const original = this.broker.publish.bind(this.broker);
    this.originalPublish = this.broker.publish;
    this.broker.publish = async (topic, message) => {
      const fault = ctx.getFaultDecision('MESSAGE_QUEUE', { topic });
      ctx.recordEvent({
        domain: 'MESSAGE_QUEUE',
        fault: fault?.type,
        payload: { topic, messageId: message.key },
      });
      await original(topic, message);
      if (fault?.type === 'MESSAGE_DUPLICATE') await original(topic, message);
    };
  }

  uninstall() {
    if (this.originalPublish) this.broker.publish = this.originalPublish;
  }
}

// --- The application ---------------------------------------------------------------------------

const db = { balance: 100 };
const broker = new InMemoryBroker();

broker.subscribe('stripe-webhooks', async message => {
  const payload = JSON.parse(message.value) as { userId: string; amount: number };
  // BUG: does not record that event `message.key` was already applied.
  db.balance += payload.amount;
});

// --- The search ------------------------------------------------------------------------------------

const templates: FaultScheduleTemplate[] = [
  {
    id: '0d7f3c52-4b0e-4f7a-9a51-2f7c1b8e6d10',
    spec: { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_DUPLICATE' },
    probabilityRange: [0, 1],
    target: { topic: 'stripe-webhooks' },
  },
];

const creditedOnce: ProgrammaticPromise = {
  id: 'webhook-credited-once',
  description: 'A $50 payment webhook credits the user exactly once',
  severity: 'CRITICAL',
  evaluate: () => ({ passed: db.balance === 150, message: `balance is $${db.balance}, expected $150` }),
};

async function main() {
  const orchestrator = new SearchOrchestrator({
    workflow: async () => {
      db.balance = 100;
      await broker.publish('stripe-webhooks', {
        key: 'evt_123',
        value: JSON.stringify({ userId: 'u1', amount: 50 }),
      });
    },
    templates,
    promises: [creditedOnce],
    iterations: 20,
    earlyExit: true,
    seed: 'webhook-idempotency-example',
  });
  orchestrator.registerDriver(new BrokerFaultDriver(broker));

  const result = await orchestrator.run();
  console.log(`${result.totalRuns} runs, ${result.failures} failed (seed ${result.seed})`);

  const worst = result.worstRun;
  if (worst && !worst.passed) {
    const broken = worst.promiseResults.find(r => !r.passed);
    const faults = worst.events?.filter(e => e.fault).map(e => `${e.domain}/${e.fault}`).join(', ');
    console.error(`[promise failed] ${broken?.promiseId}: ${broken?.message} (faults: ${faults || 'none'})`);
    process.exitCode = 1;
  } else {
    console.log('[promise held] no duplicate delivery broke the consumer');
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
