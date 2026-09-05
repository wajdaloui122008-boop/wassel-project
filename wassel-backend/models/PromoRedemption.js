const mongoose = require("mongoose");

const promoRedemptionSchema = new mongoose.Schema({
  code: { type: mongoose.Schema.Types.ObjectId, ref: "PromoCode", required: true },
  codeValue: { type: String, required: true, uppercase: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  discountApplied: { type: Number, required: true, min: 0 },
  redeemedAt: { type: Date, default: Date.now },
});

promoRedemptionSchema.index({ code: 1, userId: 1 });
module.exports = mongoose.model("PromoRedemption", promoRedemptionSchema);
