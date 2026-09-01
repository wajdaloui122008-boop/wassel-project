const mongoose = require("mongoose");

const VALID_STATUSES = ["nouvelle", "acceptee", "route", "livree", "annulee"];
const VALID_SERVICE_TYPES = ["colis", "food", "taxi", "shop", "market"];

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema({
  serviceType: { type: String, enum: VALID_SERVICE_TYPES, default: "colis", index: true },
  pickup: { type: String, required: true, trim: true, maxlength: 250 },
  dropoff: { type: String, required: true, trim: true, maxlength: 250 },
  pickupLocation: { type: locationSchema },
  dropoffLocation: { type: locationSchema },
  distanceKm: { type: Number, min: 0, default: null },
  estimatedDurationMin: { type: Number, min: 0, default: null },
  pkg: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: VALID_STATUSES, default: "nouvelle" },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  livreur: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  paymentMethod: { type: String, enum: ["especes", "carte", "wallet"], default: "especes" },
  fee: { type: Number, required: true, min: 0 },
  commission: { type: Number, required: true, min: 0 },
  driverEarnings: { type: Number, required: true, min: 0 },
  cancellationReason: { type: String, trim: true, maxlength: 300, default: "" },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
});

orderSchema.set("toJSON", { virtuals: true, transform: (doc, ret) => { delete ret._id; delete ret.__v; } });

module.exports = mongoose.model("Order", orderSchema);