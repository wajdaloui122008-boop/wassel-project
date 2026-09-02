const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  method: { type: String, enum: ["especes", "carte", "wallet"], required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "TND", uppercase: true, minlength: 3, maxlength: 3 },
  status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
  provider: { type: String, default: null, index: true },
  transactionId: { type: String, default: null, index: true },
  paidAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
