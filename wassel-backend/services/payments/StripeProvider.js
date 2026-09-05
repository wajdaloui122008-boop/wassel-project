const Stripe = require("stripe");
const PaymentProvider = require("./PaymentProvider");

class StripeProvider extends PaymentProvider {
  constructor({ secretKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET } = {}) {
    super("stripe");
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret || null;
  }

  async createPaymentIntent({ amountMinor, currency, orderId, idempotencyKey }) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency: currency.toLowerCase(),
        metadata: { orderId: String(orderId) },
        automatic_payment_methods: { enabled: true }
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return {
      provider: this.name,
      providerPaymentId: intent.id,
      status: intent.status,
      amountMinor: intent.amount,
      currency: intent.currency,
      clientSecret: intent.client_secret
    };
  }

  async refundPayment({ providerPaymentId, amountMinor, idempotencyKey }) {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: providerPaymentId,
        ...(amountMinor != null ? { amount: amountMinor } : {})
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return {
      provider: this.name,
      providerRefundId: refund.id,
      providerPaymentId,
      status: refund.status,
      amountMinor: refund.amount
    };
  }

  verifyWebhook(payload, signature) {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is required for Stripe webhooks");
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  normalizeWebhookEvent(event) {
    const object = event?.data?.object || {};
    switch (event?.type) {
      case "payment_intent.succeeded":
        return { type: "captured", providerPaymentId: object.id };
      case "payment_intent.payment_failed":
        return { type: "failed", providerPaymentId: object.id };
      case "charge.refunded":
      case "refund.updated":
        return { type: "refunded", providerPaymentId: object.payment_intent || null, providerRefundId: object.id || null };
      default:
        return { type: "ignored", providerPaymentId: object.id || null };
    }
  }
}

module.exports = StripeProvider;
