const mongoose = require("mongoose");

const VALID_STATUSES = ["nouvelle", "acceptee", "route", "livree"];

const orderSchema = new mongoose.Schema({
  pickup: { type: String, required: true },
  dropoff: { type: String, required: true },
  pkg: { type: String, required: true },
  status: {
    type: String,
    enum: VALID_STATUSES,
    default: "nouvelle",
  },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  livreur: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
});

// Expose a clean "id" field (string) instead of Mongo's "_id" / "__v",
// so the frontend can keep using order.id like before.
orderSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model("Order", orderSchema);