const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["order-status", "dispatch-offer", "marketing"], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  idempotencyKey: { type: String, required: true, unique: true },
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 500 },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ recipient: 1, createdAt: -1 });
module.exports = mongoose.model("Notification", notificationSchema);
