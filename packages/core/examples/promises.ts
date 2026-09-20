import { ProgrammaticPromise, allOf, anyOf } from '../src/promise';

/**
 * Ensures a checkout POST request was successfully answered (HTTP 200).
 */
export const CheckoutHttpPromise: ProgrammaticPromise = {
  id: 'checkout-http',
  description: 'Checkout HTTP endpoint returned 200 OK',
  severity: 'HIGH',
  evaluate(ctx) {
    const events = ctx.timeline(e => e.domain === 'HTTP');
    return events.some(e => 
      e.payload.url.includes('/checkout') && 
      e.payload.statusCode === 200
    );
  }
};

/**
 * Ensures the order was saved to the database.
 */
export const OrderDbPromise: ProgrammaticPromise = {
  id: 'order-db',
  description: 'Order was saved to database',
  severity: 'CRITICAL',
  evaluate(ctx) {
    const events = ctx.timeline(e => e.domain === 'DATABASE');
    return events.some(e => e.payload.query.includes('INSERT INTO orders'));
  }
};

/**
 * High-level combinator promise that guarantees the entire checkout flow completed safely.
 */
export const SafeCheckoutFlowPromise = allOf(
  'safe-checkout',
  'Checkout flow is completely safe and persisted',
  [CheckoutHttpPromise, OrderDbPromise],
  'CRITICAL'
);
