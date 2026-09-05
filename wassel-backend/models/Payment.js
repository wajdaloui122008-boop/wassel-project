const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  method: { type: String, enum: ["card", "cash"], required: true },
  provider: { type: String, default: "cash", index: true },
  providerPaymentId: { type: String, default: null, index: true },
  providerRefundId: { type: String, default: null, index: true },
  amount: { type: Number, required: true, min: 0 },
  amountMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  status: { type: String, enum: ["pending", "authorized", "captured", "failed", "refunded"], default: "pending", index: true },
  idempotencyKey: { type: String, default: null, index: true },
  providerClientSecret: { type: String, default: null, select: false },
  failureReason: { type: String, default: "", maxlength: 300 },
  cashCollectedAt: { type: Date, default: null },
  cashCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

paymentSchema.index({ provider: 1, providerPaymentId: 1 }, { sparse: true });
module.exports = mongoose.model("Payment", paymentSchema);
