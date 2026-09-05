const mongoose = require("mongoose");

const modifierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  priceDelta: { type: Number, required: true, min: -10000, max: 10000 },
}, { _id: true });

const menuItemSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  serviceType: { type: String, enum: ["food", "shop", "market"], required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  price: { type: Number, required: true, min: 0, max: 100000 },
  category: { type: String, trim: true, maxlength: 80, default: "" },
  photoUrl: { type: String, trim: true, maxlength: 2000, default: "" },
  modifiers: { type: [modifierSchema], default: [] },
  isAvailable: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

menuItemSchema.index({ vendor: 1, serviceType: 1, isAvailable: 1, category: 1 });
menuItemSchema.pre("save", function () { this.updatedAt = new Date(); });
menuItemSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  update.$set = update.$set || {};
  update.$set.updatedAt = new Date();
  this.setUpdate(update);
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
