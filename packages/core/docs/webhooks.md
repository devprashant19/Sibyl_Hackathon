# Outbound Webhook Integration Guide

Sibyl can push real-time event notifications directly to your infrastructure via HTTP Webhooks. This allows you to build custom integrations (e.g., Slack bots, PagerDuty incidents, custom CI/CD gates) without continuously polling the Sibyl API.

## 1. Supported Event Types
When registering a webhook, you can subscribe to specific events:
- `run.completed`: Fired when a Simulation Run finishes executing all injected faults.
- `promise.failed`: Fired the moment a critical system invariant (Promise) is broken during a run.
- `promise.recovered`: Fired if a previously failing promise passes on a subsequent test.

## 2. Payload Schema
All webhooks are sent as `POST` requests with a JSON body.
```json
{
  "eventId": "evt_987654321",
  "eventType": "promise.failed",
  "timestamp": "2026-08-30T12:00:00Z",
  "data": {
    "runId": "run_123456",
    "promiseId": "no-lost-messages",
    "severity": "CRITICAL",
    "faultSchedule": [ ... ]
  }
}
```

## 3. Security (HMAC Signatures)
To prove that the webhook actually came from Sibyl and hasn't been tampered with, every request includes an `x-sibyl-signature` header.

The signature is an HMAC-SHA256 hash of the raw request body, signed using your Webhook Secret (generated when you register the webhook in the UI).

**Node.js Verification Example:**
```javascript
const crypto = require('crypto');

function verifySignature(payloadStr, receivedSignature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest('hex');
    
  // Use timingSafeEqual to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  );
}
```

## 4. Retry & Backoff Policy
Sibyl expects your endpoint to acknowledge receipt by responding with a `2xx` HTTP status code within 5 seconds.

If your server returns a `4xx` (except 429), Sibyl considers it a fatal configuration error and will drop the event.
If your server returns a `5xx`, `429`, or times out, Sibyl's delivery worker will automatically retry using an **exponential backoff algorithm**:
- Attempt 1: Immediate
- Attempt 2: +2 seconds
- Attempt 3: +4 seconds
- Attempt 4: +8 seconds
- ...up to 8 attempts (max delay ~4 minutes). 
If it still fails, the event is marked as `failed` in the Sibyl dashboard and must be manually replayed.
