const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  discountType: { type: String, enum: ["percent", "fixed"], required: true },
  value: { type: Number, required: true, min: 0 },
  minOrderValue: { type: Number, min: 0, default: 0 },
  maxDiscountAmount: { type: Number, min: 0, default: null },
  usageLimit: { type: Number, min: 1, default: null },
  usedCount: { type: Number, min: 0, default: 0 },
  perUserLimit: { type: Number, min: 1, default: 1 },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  applicableVendors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isActive: { type: Boolean, default: true, index: true },
});

module.exports = mongoose.model("PromoCode", promoCodeSchema);
