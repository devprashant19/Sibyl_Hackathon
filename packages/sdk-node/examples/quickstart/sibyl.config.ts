import { definePromise, defineScheduleTemplate } from '@sibyl/sdk-node';

// We import the express server so the orchestrator runs it
import { server } from './index';

export const promises = [
  definePromise({
    id: 'no-negative-inventory',
    description: 'Inventory must never drop below 0 due to concurrent sales',
    severity: 'CRITICAL',
    evaluate: (ctx) => {
      // Find all PG Queries where we UPDATE the inventory
      const updates = ctx.timeline(e => 
        e.domain === 'DB' && 
        e.payload?.query?.includes('UPDATE products SET inventory')
      );
      
      // If any of the updates set inventory to a negative number, we fail the promise.
      return !updates.some(u => {
        const newInventory = u.payload.args[0]; // $1
        return newInventory < 0;
      });
    }
  })
];

export const templates = [
  defineScheduleTemplate({
    id: 'delay-postgres-write',
    spec: { domain: 'DB', type: 'SLOW_IO' },
    probabilityRange: [1.0, 1.0], // Force it to happen for the demo
    delayMsRange: [100, 300],
    target: { query: 'UPDATE products' }
  })
];

export async function workflow() {
  // We simulate two users trying to buy the same product at the exact same time
  await Promise.all([
    fetch('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 1, quantity: 1 })
    }),
    fetch('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 1, quantity: 1 })
    })
  ]);
  
  // Cleanup
  server.close();
}
