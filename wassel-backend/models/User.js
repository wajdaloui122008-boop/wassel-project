const authProviders = require("../services/authProviders");
const mongoose = require("mongoose");

const VALID_SERVICE_TYPES = ["colis", "food", "taxi", "shop", "market"];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["client", "livreur", "taxi", "vendor", "admin"], required: true },
  country: { type: String, default: "TN", maxlength: 2 },
  phone: { type: String, default: "", maxlength: 30 },
  capabilities: { type: [{ type: String, enum: VALID_SERVICE_TYPES }], default: VALID_SERVICE_TYPES },
  isOnline: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: false },
  cashCollectedPending: { type: Number, min: 0, default: 0 },
  ratingAverage: { type: Number, min: 0, max: 5, default: 5 },
  lastAssignedAt: { type: Date, default: null },
  currentOrderCount: { type: Number, min: 0, default: 0 },
  maxConcurrentOrders: { type: Number, min: 1, max: 10, default: 1 },
  pushToken: { type: String, default: "", maxlength: 2048, select: false },
  notificationPreferences: {
    marketingPush: { type: Boolean, default: true },
    transactionalPush: { type: Boolean, default: true },
  },
  vendorRatingAverage: { type: Number, min: 0, max: 5, default: 0 },
  location: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    updatedAt: { type: Date },
    heading: { type: Number, min: 0, max: 360 },
    speed: { type: Number, min: 0, max: 150 },
  },
  locationPoint: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined },
  },
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
});

userSchema.index({ role: 1, isOnline: 1, isAvailable: 1 });
userSchema.index({ role: 1, capabilities: 1, isOnline: 1, isAvailable: 1 });
userSchema.index({ role: 1, isOnline: 1, isAvailable: 1, "location.updatedAt": 1 });
userSchema.index({ locationPoint: "2dsphere" });

userSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
  },
});

module.exports = mongoose.model("User", userSchema);
