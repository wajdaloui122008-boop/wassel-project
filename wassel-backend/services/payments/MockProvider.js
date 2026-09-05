const PaymentProvider = require("./PaymentProvider");

class MockProvider extends PaymentProvider {
  constructor() {
    super("mock");
  }

  async createPaymentIntent({ amountMinor, currency, orderId, idempotencyKey }) {
    return {
      provider: this.name,
      providerPaymentId: `mock_pi_${orderId}`,
      status: "pending",
      amountMinor,
      currency: currency.toLowerCase(),
      idempotencyKey,
      clientSecret: null
    };
  }

  async refundPayment({ providerPaymentId, amountMinor }) {
    return {
      provider: this.name,
      providerRefundId: `mock_rf_${providerPaymentId}`,
      providerPaymentId,
      status: "refunded",
      amountMinor: amountMinor ?? null
    };
  }

  verifyWebhook(payload) {
    return typeof payload === "object" && payload !== null ? payload : null;
  }

  normalizeWebhookEvent(event) {
    if (!event?.type) return null;
    const object = event.data?.object || {};
    if (event.type === "payment_succeeded") return { type: "captured", providerPaymentId: object.id };
    if (event.type === "payment_failed") return { type: "failed", providerPaymentId: object.id };
    if (event.type === "payment_refunded") return { type: "refunded", providerPaymentId: object.id };
    return { type: "ignored", providerPaymentId: object.id || null };
  }
}

module.exports = MockProvider;
