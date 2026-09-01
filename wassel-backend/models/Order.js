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

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: VALID_STATUSES, required: true },
    at: { type: Date, default: Date.now },
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
  statusHistory: { type: [statusEventSchema], default: [] },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  livreur: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  paymentMethod: { type: String, enum: ["especes", "carte", "wallet"], default: "especes" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  transactionId: { type: String, trim: true, maxlength: 200, default: "" },
  fee: { type: Number, required: true, min: 0 },
  commission: { type: Number, required: true, min: 0 },
  driverEarnings: { type: Number, required: true, min: 0 },
  cancellationReason: { type: String, trim: true, maxlength: 300, default: "" },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
});

// Common dashboard queries: client history, driver active/history, and newest requests.
orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ livreur: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Keep a server-side timeline of every status reached by an order.
// This is embedded in the order so existing API consumers remain compatible.
orderSchema.pre("save", function (next) {
  if (this.isNew && this.status && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, at: this.createdAt || new Date() });
  } else if (this.isModified("status")) {
    const last = this.statusHistory[this.statusHistory.length - 1];
    if (!last || last.status !== this.status) {
      this.statusHistory.push({ status: this.status, at: new Date() });
    }
  }
  next();
});

// The acceptance endpoint uses findOneAndUpdate atomically. Capture that
// transition too, otherwise the timeline would miss "acceptee".
orderSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const nextStatus = update.$set?.status ?? update.status;
  if (VALID_STATUSES.includes(nextStatus)) {
    const history = update.$push || (update.$push = {});
    history.statusHistory = { status: nextStatus, at: new Date() };
  }
  next();
});

// Older clients/server routes may only send a [TYPE] prefix in `pkg`.
// Keep serviceType correct even when the request body does not contain it yet.
orderSchema.pre("validate", function (next) {
  if (this.serviceType === "colis" && typeof this.pkg === "string") {
    const match = this.pkg.match(/^\[(COLIS|FOOD|TAXI|SHOP|MARKET)\]/i);
    if (match) this.serviceType = match[1].toLowerCase();
  }
  next();
});

orderSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model("Order", orderSchema);
