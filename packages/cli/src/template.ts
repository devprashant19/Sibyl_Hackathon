export const CONFIG_TEMPLATE = `import { defineConfig } from '@sibyl/core';
import * as crypto from 'crypto';
import * as http from 'http';

// Sibyl runs \`workflow\` many times. In each run the HTTP driver may inject the faults described by
// \`templates\` into fetch() and http.request calls; afterwards every promise is checked. A run where
// a promise fails is saved with its seed, so \`sibyl replay <runId>\` reproduces it exactly.
//
// This example is self-contained: a local "payment provider" and a checkout that retries a failed
// payment without an idempotency key. Replace both with a call into your own code.

let server: http.Server;
let paymentUrl = '';
let charges = 0; // per run; fine with the default concurrency of 1

async function checkout() {
  for (let attempt = 0; attempt < 2; attempt++) {
    charges++; // the provider charged the card before its response was lost
    const res = await fetch(paymentUrl, { method: 'POST' }).catch(() => undefined);
    if (res?.ok) return;
  }
}

export default defineConfig({
  drivers: ['http'],
  iterations: 50,
  setup: async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    paymentUrl = \`http://127.0.0.1:\${(server.address() as any).port}/pay\`;
  },
  teardown: () => new Promise<void>(resolve => server.close(() => resolve())),
  workflow: async () => {
    charges = 0;
    await checkout();
  },
  templates: [
    {
      id: crypto.randomUUID(),
      spec: { domain: 'HTTP', type: 'HTTP_5XX' },
      probabilityRange: [0, 1],
    },
  ],
  promises: [
    {
      id: 'charge-at-most-once',
      description: 'A checkout never charges the customer twice',
      severity: 'CRITICAL',
      evaluate: () => ({ passed: charges <= 1, message: \`charged \${charges} times\` }),
    },
  ],
});
`;
