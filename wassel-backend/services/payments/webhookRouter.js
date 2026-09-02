const express = require("express");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const { getPaymentProvider } = require("./index");

const router = express.Router();
router.post("/:provider", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  try {
    const providerName = String(req.params.provider || "").trim().toLowerCase();
    const provider = getPaymentProvider(providerName);
    const signature = req.get("Stripe-Signature") || req.get("X-Webhook-Signature") || null;
    const payload = providerName === "stripe" ? req.body : JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body));
    const event = provider.verifyWebhook(payload, signature);
    if (!event) return res.status(400).json({ error: "Webhook invalide" });

    const normalized = provider.normalizeWebhookEvent(event);
    if (!normalized || normalized.type === "ignored") return res.json({ received: true, ignored: true });

    let payment = normalized.providerPaymentId ? await Payment.findOne({ provider: providerName, providerPaymentId: normalized.providerPaymentId }) : null;
    if (!payment && normalized.providerRefundId) payment = await Payment.findOne({ provider: providerName, providerRefundId: normalized.providerRefundId });
    if (!payment) return res.status(404).json({ error: "Transaction fournisseur introuvable" });

    const eventId = event.id ? String(event.id) : null;
    if (eventId && payment.metadata?.lastWebhookEventId === eventId) return res.json({ received: true, duplicate: true });

    if (normalized.type === "paid") {
      payment.status = "paid";
      payment.paidAt = payment.paidAt || new Date();
      payment.transactionId = payment.providerPaymentId || payment.transactionId || "";
      await Order.findByIdAndUpdate(payment.order, { $set: { paymentStatus: "paid", transactionId: payment.providerPaymentId || "" } });
    } else if (normalized.type === "failed") {
      payment.status = "failed";
      await Order.findByIdAndUpdate(payment.order, { $set: { paymentStatus: "failed", transactionId: payment.providerPaymentId || "" } });
    } else if (normalized.type === "refunded") {
      payment.status = "refunded";
      payment.providerRefundId = normalized.providerRefundId || payment.providerRefundId;
      payment.refundedAt = payment.refundedAt || new Date();
      await Order.findByIdAndUpdate(payment.order, { $set: { paymentStatus: "refunded", transactionId: payment.providerPaymentId || "" } });
    }

    payment.metadata = { ...(payment.metadata || {}), ...(eventId ? { lastWebhookEventId: eventId } : {}) };
    await payment.save();
    res.json({ received: true });
  } catch (err) {
    console.error("Payment webhook error:", err);
    res.status(400).json({ error: "Webhook verification or processing failed" });
  }
});

module.exports = router;
