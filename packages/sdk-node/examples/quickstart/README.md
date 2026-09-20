# Sibyl Node.js Quickstart

This example demonstrates how to integrate Sibyl into a standard Express + Postgres application with exactly 2 lines of code, and how to use it to catch a realistic database race condition (TOCTOU).

## 1. The Application Bug
In `index.ts`, we have an endpoint `POST /api/checkout`. 
It reads the inventory, verifies there is stock, and then writes the new stock. Because it doesn't wrap this in a transaction using `SELECT ... FOR UPDATE`, it is vulnerable to a race condition. If two requests read the stock at the same time, they will both think they can sell the item, resulting in negative inventory.

## 2. Integration
Notice the very top of `index.ts`:
```typescript
import { install } from '@sibyl/sdk-node';
install();
```
That's it! Sibyl has automatically hooked the `pg` driver and the `http` modules. 

## 3. The Promise
In `sibyl.config.ts`, we use `definePromise` (which gives you full TypeScript autocomplete) to declare that our inventory should never drop below 0:
```typescript
const updates = ctx.timeline(e => e.payload?.query?.includes('UPDATE products'));
return !updates.some(u => u.payload.args[0] < 0);
```

## 4. Running the Simulation

Execute the search engine using the CLI:
```bash
pnpm install
npx sibyl run --target sibyl.config.ts --iterations 10 --local-only
```

You will see Sibyl inject the `SLOW_IO` fault defined in our templates right between the `SELECT` and the `UPDATE`. This artificially forces the race condition window wide open, causing the second request to overwrite the first. The promise will fail, and Sibyl will report the exact sequence of events that caused your invariant to break!
