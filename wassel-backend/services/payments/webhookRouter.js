const express = require("express");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const { notifyOrderStatus } = require("../notificationService");
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

    if (normalized.type === "captured") {
      payment.status = "captured";
      const order = await Order.findByIdAndUpdate(payment.orderId, { $set: { paymentStatus: "paid", transactionId: payment.providerPaymentId || "" } }, { returnDocument: "after" });
      if (order) await notifyOrderStatus(order, "acceptee");
    } else if (normalized.type === "failed") {
      payment.status = "failed";
      payment.failureReason = String(event.data?.object?.last_payment_error?.message || "").slice(0, 300);
      const order = await Order.findByIdAndUpdate(payment.orderId, { $set: { paymentStatus: "failed", transactionId: payment.providerPaymentId || "" } }, { returnDocument: "after" });
      if (order) await notifyOrderStatus(order, "annulee");
    } else if (normalized.type === "refunded") {
      payment.status = "refunded";
      payment.providerRefundId = normalized.providerRefundId || payment.providerRefundId;
      await Order.findByIdAndUpdate(payment.orderId, { $set: { paymentStatus: "refunded", transactionId: payment.providerPaymentId || "" } });
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
