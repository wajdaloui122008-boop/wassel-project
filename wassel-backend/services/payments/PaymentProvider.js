class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async createPaymentIntent() {
    throw new Error("createPaymentIntent() must be implemented by the payment provider");
  }

  async refundPayment() {
    throw new Error("refundPayment() must be implemented by the payment provider");
  }

  verifyWebhook() {
    throw new Error("verifyWebhook() must be implemented by the payment provider");
  }

  normalizeWebhookEvent() {
    throw new Error("normalizeWebhookEvent() must be implemented by the payment provider");
  }
}

module.exports = PaymentProvider;
