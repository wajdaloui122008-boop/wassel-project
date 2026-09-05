const mongoose = require("mongoose");

const daySchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  open: { type: String, match: /^\d{2}:\d{2}$/, default: "09:00" },
  close: { type: String, match: /^\d{2}:\d{2}$/, default: "22:00" },
}, { _id: false });

const vendorSettingsSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  temporarilyClosed: { type: Boolean, default: false },
  hours: {
    monday: { type: daySchema, default: () => ({}) },
    tuesday: { type: daySchema, default: () => ({}) },
    wednesday: { type: daySchema, default: () => ({}) },
    thursday: { type: daySchema, default: () => ({}) },
    friday: { type: daySchema, default: () => ({}) },
    saturday: { type: daySchema, default: () => ({}) },
    sunday: { type: daySchema, default: () => ({}) },
  },
  updatedAt: { type: Date, default: Date.now },
});

vendorSettingsSchema.pre("save", function () { this.updatedAt = new Date(); });
vendorSettingsSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  update.$set = update.$set || {};
  update.$set.updatedAt = new Date();
  this.setUpdate(update);
});

module.exports = mongoose.model("VendorSettings", vendorSettingsSchema);
