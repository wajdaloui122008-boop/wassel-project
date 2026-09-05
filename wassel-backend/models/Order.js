const mongoose = require("mongoose");

const VALID_STATUSES = ["nouvelle", "acceptee", "route", "livree", "annulee"];
const VALID_SERVICE_TYPES = ["colis", "food", "taxi", "shop", "market"];
const VALID_OFFER_STATUSES = ["offered", "declined", "expired", "accepted", "cancelled"];

const locationSchema = new mongoose.Schema({ lat: { type: Number, required: true, min: -90, max: 90 }, lng: { type: Number, required: true, min: -180, max: 180 } }, { _id: false });
const statusEventSchema = new mongoose.Schema({ status: { type: String, enum: VALID_STATUSES, required: true }, at: { type: Date, default: Date.now } }, { _id: false });
const dispatchOfferSchema = new mongoose.Schema({ driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, status: { type: String, enum: VALID_OFFER_STATUSES, default: "offered" }, distanceToPickupKm: { type: Number, min: 0, default: null }, offeredAt: { type: Date, default: Date.now }, expiresAt: { type: Date, required: true }, respondedAt: { type: Date, default: null } }, { _id: false });
const orderItemSchema = new mongoose.Schema({ itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }, name: { type: String, required: true, maxlength: 120 }, quantity: { type: Number, required: true, min: 1, max: 100 }, unitPrice: { type: Number, required: true, min: 0 }, modifiers: [{ name: String, priceDelta: Number }] }, { _id: false });

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
  statusHistory: { type: [statusEventSchema], default: [] },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  vendorRejectReason: { type: String, trim: true, maxlength: 40, default: "" },
  vendorStatus: { type: String, enum: ["pending", "accepted", "rejected"], default: "accepted", index: true },
  readyAt: { type: Date, default: null },
  pickupStatus: { type: String, enum: ["pending", "ready"], default: "pending", index: true },
  items: { type: [orderItemSchema], default: [] },
  livreur: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  dispatchOffers: { type: [dispatchOfferSchema], default: [] },
  paymentMethod: { type: String, enum: ["especes", "carte", "wallet"], default: "especes" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  currency: { type: String, default: process.env.DEFAULT_CURRENCY || "TND", uppercase: true, minlength: 3, maxlength: 3 },
  transactionId: { type: String, trim: true, maxlength: 200, default: "" },
  itemsTotal: { type: Number, min: 0, default: 0 },
  promoCode: { type: String, trim: true, uppercase: true, maxlength: 40, default: "" },
  promoDiscount: { type: Number, min: 0, default: 0 },
  fee: { type: Number, required: true, min: 0 },
  commission: { type: Number, required: true, min: 0 },
  driverEarnings: { type: Number, required: true, min: 0 },
  cancellationReason: { type: String, trim: true, maxlength: 300, default: "" },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, status: 1, createdAt: -1 });
orderSchema.index({ livreur: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "dispatchOffers.driver": 1, "dispatchOffers.status": 1, "dispatchOffers.expiresAt": 1 });
orderSchema.index(
  { livreur: 1 },
  { name: "active_livreur_unique", unique: true, partialFilterExpression: { status: { $in: ["acceptee", "route"] }, livreur: { $type: "objectId" } } },
);

orderSchema.pre("save", function () {
  if (this.isNew && this.status && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, at: this.createdAt || new Date() });
  } else if (this.isModified("status")) {
    const last = this.statusHistory[this.statusHistory.length - 1];
    if (!last || last.status !== this.status) this.statusHistory.push({ status: this.status, at: new Date() });
  }
  this.updatedAt = new Date();
});

orderSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  const now = new Date();
  update.$set = update.$set || {};
  update.$set.updatedAt = now;
  const nextStatus = update.$set.status ?? update.status;
  if (VALID_STATUSES.includes(nextStatus)) {
    const push = update.$push || (update.$push = {});
    push.statusHistory = { status: nextStatus, at: now };
  }
  this.setUpdate(update);
});

orderSchema.pre("validate", function () {
  if (this.serviceType === "colis" && typeof this.pkg === "string") {
    const match = this.pkg.match(/^\[(COLIS|FOOD|TAXI|SHOP|MARKET)\]/i);
    if (match) this.serviceType = match[1].toLowerCase();
  }
});

orderSchema.set("toJSON", { virtuals: true, transform: (doc, ret) => { delete ret._id; delete ret.__v; } });
module.exports = mongoose.model("Order", orderSchema);
