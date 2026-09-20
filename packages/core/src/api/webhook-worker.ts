import * as crypto from 'crypto';

export interface WebhookEvent {
  eventId: string;
  eventType: 'run.completed' | 'promise.failed' | 'promise.recovered';
  timestamp: string;
  data: any;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  eventTypes: string[];
}

export class WebhookWorker {
  private queue: { event: WebhookEvent, sub: WebhookSubscription, attempts: number }[] = [];
  private subscriptions: WebhookSubscription[] = [];
  private processing = false;

  public registerSubscription(sub: WebhookSubscription) {
    this.subscriptions.push(sub);
  }

  public dispatch(event: WebhookEvent) {
    const matchingSubs = this.subscriptions.filter(s => 
      s.eventTypes.includes(event.eventType) || s.eventTypes.includes('*')
    );

    for (const sub of matchingSubs) {
      this.queue.push({ event, sub, attempts: 0 });
    }

    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      
      try {
        await this.deliver(job.event, job.sub);
      } catch (err) {
        job.attempts++;
        if (job.attempts < 8) { // Max 8 attempts
          const backoffDelay = Math.pow(2, job.attempts) * 1000;
          console.error(`Webhook delivery failed for ${job.sub.url}. Retrying in ${backoffDelay}ms...`);
          
          setTimeout(() => {
            this.queue.push(job);
            if (!this.processing) this.processQueue();
          }, backoffDelay);
        } else {
          console.error(`Webhook delivery permanently failed for ${job.sub.url} after 8 attempts.`);
        }
      }
    }

    this.processing = false;
  }

  private async deliver(event: WebhookEvent, sub: WebhookSubscription): Promise<void> {
    const payloadStr = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', sub.secret)
      .update(payloadStr)
      .digest('hex');

    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sibyl-signature': signature
      },
      body: payloadStr
    });

    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      // Client configuration error, do not retry
      console.warn(`Webhook endpoint ${sub.url} returned ${res.status}. Dropping event.`);
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
  }
}
