import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;
  
  constructor() {
    // In v1 we safely bypass network calls if no key is provided
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
      apiVersion: '2025-01-27.acacia' as any
    });
  }

  /**
   * In Oracle tier, billing is strictly $150/service/month (minimum 3 services).
   * Call this whenever a project is created or deleted to adjust the meter.
   */
  public async updateServiceCount(subscriptionId: string, subscriptionItemId: string, projectCount: number) {
    const quantity = Math.max(3, projectCount); // 3-service minimum floor

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(`[Stripe MOCK] Updating subscription ${subscriptionId} item ${subscriptionItemId} to quantity: ${quantity}`);
      return;
    }

    try {
      await this.stripe.subscriptionItems.update(subscriptionItemId, {
        quantity,
      });
      console.log(`[Stripe] Successfully adjusted billing meter to ${quantity} services.`);
    } catch (err: any) {
      console.error(`[Stripe Error] Failed to update service quantity: ${err.message}`);
    }
  }

  /**
   * Generates a checkout session to upgrade from Seer -> Oracle
   */
  public async createCheckoutSession(orgId: string, customerId: string, priceId: string, successUrl: string, cancelUrl: string) {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(`[Stripe MOCK] Generating checkout session for ${orgId}`);
      return { url: 'https://mock.stripe.com/checkout/seer_to_oracle' };
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // The $150/service/month price ID
          quantity: 3,    // Minimum 3 services
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: orgId,
    });

    return { url: session.url };
  }
}
