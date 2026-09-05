const express = require("express");
const mongoose = require("mongoose");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const User = require("../../models/User");
const { requireAuth, requireRole } = require("../../middleware/auth");
const { getPaymentProvider, normalizeCurrency, toMinorUnits } = require("./index");
const { notifyOrderStatus } = require("../notificationService");

const router = express.Router();
const methodFor = (value) => value === "especes" || value === "cash" ? "cash" : "card";
const orderQuery = (id, user) => user.role === "admin" ? { _id: id } : { _id: id, client: user.id };
const idempotencyKey = (req) => String(req.get("Idempotency-Key") || req.body?.idempotencyKey || "").trim().slice(0, 200) || null;
const orderPaymentStatus = (status) => status === "captured" ? "paid" : status === "refunded" ? "refunded" : status === "failed" ? "failed" : "pending";

async function findPayment(orderId) {
  return Payment.findOne({ orderId });
}

router.get("/config", (req, res) => {
  const provider = String(process.env.PAYMENT_PROVIDER || "mock").trim().toLowerCase();
  res.json({ provider, configured: provider !== "stripe" || Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY), stripePublishableKey: provider === "stripe" ? (process.env.STRIPE_PUBLISHABLE_KEY || null) : null });
});

async function createIntent(req, res) {
  try {
    const orderId = String(req.body.orderId || "").trim();
    if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ error: "orderId invalide" });
    const order = await Order.findOne(orderQuery(orderId, req.user));
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    if (order.status === "annulee") return res.status(409).json({ error: "Commande annulée" });
    if (methodFor(order.paymentMethod) !== "card") return res.status(400).json({ error: "Cette commande est en paiement cash" });
    if (order.paymentStatus === "paid") return res.status(409).json({ error: "Commande déjà payée" });
    const currency = normalizeCurrency(order.currency);
    const amountMinor = toMinorUnits(order.fee, currency);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return res.status(400).json({ error: "Montant de paiement invalide" });
    const key = idempotencyKey(req) || `order_${order._id}`;
    let payment = await Payment.findOne({ orderId: order._id }).select("+providerClientSecret");
    if (payment?.status === "captured") return res.status(409).json({ error: "Commande déjà payée" });
    if (payment?.providerPaymentId) {
      return res.json({ payment, order, clientSecret: payment.providerClientSecret || null });
    }
    const provider = getPaymentProvider();
    const result = await provider.createPaymentIntent({ amountMinor, currency, orderId: order._id, idempotencyKey: key });
    payment = payment || new Payment({ orderId: order._id, user: order.client });
    Object.assign(payment, { method: "card", provider: result.provider, providerPaymentId: result.providerPaymentId, amount: order.fee, amountMinor, currency: result.currency.toUpperCase(), status: result.status === "succeeded" ? "captured" : "pending", idempotencyKey: key, providerClientSecret: result.clientSecret || null });
    await payment.save();
    order.paymentStatus = orderPaymentStatus(payment.status);
    order.transactionId = payment.providerPaymentId || "";
    await order.save();
    return res.status(201).json({ payment, order, clientSecret: result.clientSecret || null });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Transaction déjà créée" });
    console.error("Create payment intent error:", err);
    return res.status(500).json({ error: "Erreur paiement" });
  }
}
router.post("/intent", requireAuth, requireRole("client"), createIntent);
router.post("/", requireAuth, requireRole("client"), createIntent);

router.get("/:orderId", requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) return res.status(400).json({ error: "Identifiant de commande invalide" });
    const ownership = req.user.role === "admin"
      ? { _id: req.params.orderId }
      : req.user.role === "client"
        ? { _id: req.params.orderId, client: req.user.id }
        : { _id: req.params.orderId, livreur: req.user.id };
    const order = await Order.findOne(ownership).select("_id");
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    const payment = await findPayment(order._id);
    if (!payment) return res.status(404).json({ error: "Transaction introuvable" });
    res.json({ payment });
  } catch (err) { console.error("Get payment error:", err); res.status(500).json({ error: "Erreur paiement" }); }
});

router.post("/:id/cash-collected", requireAuth, requireRole("livreur"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identifiant de paiement invalide" });
    if (req.body.collected !== true) return res.status(400).json({ error: "La collecte cash doit être confirmée explicitement" });
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: "Transaction introuvable" });
    const order = await Order.findOne({ _id: payment.orderId, livreur: req.user.id, status: "route" });
    if (!order || payment.method !== "cash") return res.status(403).json({ error: "Cette collecte n'est pas autorisée" });
    payment.status = "captured";
    payment.cashCollectedAt = new Date();
    payment.cashCollectedBy = req.user.id;
    await payment.save();
    order.paymentStatus = "paid";
    order.status = "livree";
    await order.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { cashCollectedPending: payment.amount } });
    await notifyOrderStatus(order, "livree");
    res.json({ payment, order });
  } catch (err) { console.error("Cash collection error:", err); res.status(500).json({ error: "Erreur de confirmation cash" }); }
});

router.post("/:id/refund", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identifiant de transaction invalide" });
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: "Transaction introuvable" });
    if (payment.status !== "captured") return res.status(409).json({ error: "Seule une transaction capturée peut être remboursée" });
    const reason = String(req.body.reasonCode || req.body.reason || "").trim().slice(0, 80);
    if (!reason) return res.status(400).json({ error: "reasonCode est requis" });
    if (payment.method === "cash") return res.status(409).json({ error: "Les remboursements cash nécessitent une réconciliation manuelle" });
    const provider = getPaymentProvider(payment.provider);
    const amountMinor = toMinorUnits(req.body.amount == null ? payment.amount : Number(req.body.amount), payment.currency);
    const result = await provider.refundPayment({ providerPaymentId: payment.providerPaymentId, amountMinor, idempotencyKey: idempotencyKey(req) || `refund_${payment._id}` });
    if (result.status === "succeeded" || result.status === "refunded") payment.status = "refunded";
    payment.providerRefundId = result.providerRefundId || null;
    payment.failureReason = reason;
    await payment.save();
    await Order.findByIdAndUpdate(payment.orderId, { $set: { paymentStatus: payment.status === "refunded" ? "refunded" : "paid", transactionId: payment.providerPaymentId || "" } });
    res.json({ payment, refund: result });
  } catch (err) { console.error("Refund payment error:", err); res.status(500).json({ error: "Erreur remboursement" }); }
});

module.exports = router;
