const express = require("express");
const mongoose = require("mongoose");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const { requireAuth, requireRole } = require("../../middleware/auth");
const { getPaymentProvider, normalizeCurrency, toMinorUnits } = require("./index");

const router = express.Router();
function idempotencyKey(req) { const value = req.get("Idempotency-Key") || req.body?.idempotencyKey || ""; return String(value).trim().slice(0, 200) || null; }

// Safe public configuration: never expose a Stripe secret key.
router.get("/config", (req, res) => {
  const provider = String(process.env.PAYMENT_PROVIDER || "mock").trim().toLowerCase();
  res.json({
    provider,
    configured: provider !== "stripe" || Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKey: provider === "stripe" ? (process.env.STRIPE_PUBLISHABLE_KEY || null) : null
  });
});

router.post("/", requireAuth, requireRole("client"), async (req, res) => {
  try {
    const orderId = String(req.body.orderId || "").trim();
    if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ error: "orderId invalide" });
    const order = await Order.findOne({ _id: orderId, client: req.user.id });
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    if (order.status === "annulee") return res.status(409).json({ error: "Commande annulée" });
    if (order.paymentMethod === "especes") return res.status(400).json({ error: "Cette commande est en paiement espèces" });
    if (order.paymentStatus === "paid") return res.status(409).json({ error: "Commande déjà payée" });
    const currency = normalizeCurrency(order.currency || process.env.DEFAULT_CURRENCY || "TND");
    const amountMinor = toMinorUnits(order.fee, currency);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return res.status(400).json({ error: "Montant de paiement invalide" });
    const key = idempotencyKey(req);
    let payment = key ? await Payment.findOne({ user: req.user.id, idempotencyKey: key }) : null;
    if (payment) return res.status(200).json({ payment, order, clientSecret: payment.metadata?.clientSecret || null });
    payment = await Payment.findOne({ order: order._id });
    if (payment?.status === "paid") return res.status(409).json({ error: "Commande déjà payée" });
    const provider = getPaymentProvider();
    const providerResult = payment?.providerPaymentId
      ? { provider: payment.provider, providerPaymentId: payment.providerPaymentId, status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency, clientSecret: payment.metadata?.clientSecret || null }
      : await provider.createPaymentIntent({ amountMinor, currency, orderId: order._id, idempotencyKey: key });
    const values = { order: order._id, user: req.user.id, method: order.paymentMethod, amount: order.fee, amountMinor, currency, status: providerResult.status === "succeeded" ? "paid" : "pending", provider: providerResult.provider, providerPaymentId: providerResult.providerPaymentId || null, transactionId: providerResult.providerPaymentId || null, ...(key ? { idempotencyKey: key } : {}), metadata: { ...(payment?.metadata || {}), clientSecret: providerResult.clientSecret || null } };
    if (payment) { Object.assign(payment, values); await payment.save(); } else payment = await Payment.create(values);
    if (payment.status === "paid") { payment.paidAt = new Date(); await payment.save(); order.paymentStatus = "paid"; } else order.paymentStatus = "pending";
    order.transactionId = payment.providerPaymentId || "";
    await order.save();
    res.status(payment.status === "paid" ? 200 : 201).json({ payment, order, clientSecret: providerResult.clientSecret || null });
  } catch (err) { if (err?.code === 11000) return res.status(409).json({ error: "Transaction déjà créée" }); console.error("Create provider payment error:", err); res.status(500).json({ error: "Erreur paiement" }); }
});

router.get("/:orderId", requireAuth, async (req, res) => {
  try { if (!mongoose.isValidObjectId(req.params.orderId)) return res.status(400).json({ error: "Identifiant de commande invalide" }); const filter = req.user.role === "admin" ? { order: req.params.orderId } : { order: req.params.orderId, user: req.user.id }; const payment = await Payment.findOne(filter); if (!payment) return res.status(404).json({ error: "Transaction introuvable" }); res.json({ payment }); }
  catch (err) { console.error("Get payment error:", err); res.status(500).json({ error: "Erreur paiement" }); }
});

router.post("/:id/refund", requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identifiant de transaction invalide" });
    const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, user: req.user.id };
    const payment = await Payment.findOne(filter);
    if (!payment) return res.status(404).json({ error: "Transaction introuvable" });
    if (payment.status !== "paid") return res.status(409).json({ error: "Seule une transaction payée peut être remboursée" });
    if (!payment.providerPaymentId) return res.status(409).json({ error: "Cette transaction n'a pas de paiement fournisseur" });
    const provider = getPaymentProvider(payment.provider);
    const requestedAmount = req.body.amount != null ? Number(req.body.amount) : payment.amount;
    const amountMinor = toMinorUnits(requestedAmount, payment.currency);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > payment.amountMinor) return res.status(400).json({ error: "Montant de remboursement invalide" });
    const result = await provider.refundPayment({ providerPaymentId: payment.providerPaymentId, amountMinor, idempotencyKey: idempotencyKey(req) || `refund_${payment._id}_${amountMinor}` });
    payment.providerRefundId = result.providerRefundId || payment.providerRefundId;
    payment.metadata = { ...(payment.metadata || {}), refundStatus: result.status || "unknown", refundAmountMinor: amountMinor };
    if (result.status === "succeeded" || result.status === "refunded") { payment.status = "refunded"; payment.refundedAt = new Date(); await Order.findByIdAndUpdate(payment.order, { $set: { paymentStatus: "refunded", transactionId: payment.providerPaymentId || "" } }); }
    await payment.save(); res.json({ payment, refund: result });
  } catch (err) { console.error("Refund payment error:", err); res.status(500).json({ error: "Erreur remboursement" }); }
});

router.post("/:id/fail", requireAuth, requireRole("client"), async (req, res) => {
  try { const payment = await Payment.findOne({ _id: req.params.id, user: req.user.id }); if (!payment) return res.status(404).json({ error: "Transaction introuvable" }); if (payment.status !== "pending") return res.status(409).json({ error: "Transaction déjà traitée" }); payment.status = "failed"; payment.metadata = { ...(payment.metadata || {}), reason: String(req.body?.reason || "payment_failed").trim().slice(0, 200) }; await payment.save(); await Order.findByIdAndUpdate(payment.order, { $set: { paymentStatus: "failed", transactionId: payment.providerPaymentId || "" } }); res.json({ payment }); }
  catch (err) { console.error("Fail payment error:", err); res.status(500).json({ error: "Erreur paiement" }); }
});

module.exports = router;
