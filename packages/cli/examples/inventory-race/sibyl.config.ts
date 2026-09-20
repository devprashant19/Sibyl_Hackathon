import { defineConfig, AsyncContext } from '@sibyl/core';
import * as http from 'http';

// A lost update. Two shoppers buy the last items of a product at nearly the same time. The shop reads
// the stock level, then writes back `stock - 1` — read-modify-write with no lock and no version
// check. On a quiet network the second purchase starts after the first finishes and nothing goes
// wrong. Slow down the first write by more than the gap between the two purchases and both writes
// are computed from the same read: one sale disappears from the books.
//
// The fault is a SLOW_RESPONSE on the write (PUT) with a delay somewhere in 1–120 ms. Most delays are
// harmless; the search has to find the range that is not.
//
//   sibyl run -c examples/inventory-race/sibyl.config.ts -n 40

const INITIAL_STOCK = 10;
const GAP_MS = 25; // how far apart the two purchases start

let server: http.Server;
let base = '';
// One inventory per run, keyed by run id, so concurrent runs cannot interfere.
const stock = new Map<string, number>();
const sold = new Map<string, number>();

async function purchase(runId: string) {
  const res = await fetch(`${base}/stock/${runId}`);
  const current = Number(await res.text());
  await fetch(`${base}/stock/${runId}`, { method: 'PUT', body: String(current - 1) });
  sold.set(runId, (sold.get(runId) ?? 0) + 1);
}

export default defineConfig({
  project: 'inventory-race',
  drivers: ['http'],
  iterations: 40,
  strategy: 'bayesian',
  setup: async () => {
    server = http.createServer((req, res) => {
      const runId = req.url!.split('/')[2];
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
          stock.set(runId, Number(body));
          res.end('ok');
        });
      } else {
        res.end(String(stock.get(runId) ?? INITIAL_STOCK));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  },
  teardown: () => new Promise<void>(resolve => server.close(() => resolve())),
  workflow: async () => {
    const runId = AsyncContext.getRunId()!;
    stock.set(runId, INITIAL_STOCK);
    sold.set(runId, 0);
    const first = purchase(runId);
    await new Promise(r => setTimeout(r, GAP_MS));
    await Promise.all([first, purchase(runId)]);
  },
  templates: [
    {
      id: '6f0c7f4e-4c1f-4a55-9d0e-6b1f5b2a7c11',
      spec: { domain: 'HTTP', type: 'SLOW_RESPONSE' },
      target: { method: 'PUT' },
      probabilityRange: [1, 1],
      delayMsRange: [1, 120],
    },
  ],
  promises: [
    {
      id: 'no-lost-sales',
      description: 'Stock on hand equals initial stock minus items sold',
      severity: 'CRITICAL',
      evaluate: (ctx: any) => {
        const expected = INITIAL_STOCK - (sold.get(ctx.runId) ?? 0);
        const actual = stock.get(ctx.runId);
        return {
          passed: actual === expected,
          message: `stock is ${actual}, expected ${expected}`,
          actualValue: actual,
        };
      },
    },
  ],
});
