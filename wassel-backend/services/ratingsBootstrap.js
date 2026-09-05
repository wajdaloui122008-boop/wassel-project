const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const ratingSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rater: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ratedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rating: { type: Number, min: 1, max: 5 },
  driverRating: { type: Number, min: 1, max: 5, default: null },
  vendorRating: { type: Number, min: 1, max: 5, default: null },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  flaggedAt: { type: Date, default: null },
  flagReason: { type: String, default: "", maxlength: 300 },
  comment: { type: String, trim: true, maxlength: 500, default: "" },
  createdAt: { type: Date, default: Date.now }
});
ratingSchema.index({ order: 1, rater: 1 }, { unique: true });
ratingSchema.index({ ratedUser: 1, createdAt: -1 });
const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);

const router = express.Router();
router.use(requireAuth);

router.post("/", async (req, res) => {
  try {
    const orderId = String(req.body.orderId || "");
    const score = Number(req.body.rating), driverScore = req.body.driverRating == null ? null : Number(req.body.driverRating), vendorScore = req.body.vendorRating == null ? null : Number(req.body.vendorRating);
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) : "";
    if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ error: "Identifiant de commande invalide" });
    const scores = [score, driverScore, vendorScore].filter((value) => Number.isFinite(value));
    if (!scores.length || scores.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return res.status(400).json({ error: "Les notes doivent être comprises entre 1 et 5" });

    const order = await Order.findById(orderId).select("client livreur vendor status serviceType");
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    if (order.status !== "livree") return res.status(409).json({ error: "La commande doit être livrée avant de laisser une note" });

    const me = String(req.user.id);
    const clientId = String(order.client);
    const driverId = order.livreur ? String(order.livreur) : "";
    if (me !== clientId) return res.status(403).json({ error: "Seul le client peut noter cette commande" });

    const rating = await Rating.create({ order: order._id, rater: req.user.id, ratedUser: driverId || null, rating: score || null, driverRating: driverScore || score || null, vendorRating: vendorScore, vendor: order.vendor || null, comment });
    if (driverId && driverScore) await User.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(driverId) } }, { $lookup: { from: "ratings", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$ratedUser", "$$id"] }, { $ne: ["$driverRating", null] }] } } }], as: "ratings" } }, { $set: { ratingAverage: { $ifNull: [{ $avg: "$ratings.driverRating" }, 0] } } }, { $merge: { into: "users", on: "_id", whenMatched: "merge", whenNotMatched: "discard" } }]);
    if (order.vendor && vendorScore) await User.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(order.vendor) } }, { $lookup: { from: "ratings", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$vendor", "$$id"] } } }], as: "ratings" } }, { $set: { vendorRatingAverage: { $ifNull: [{ $avg: "$ratings.vendorRating" }, 0] } } }, { $merge: { into: "users", on: "_id", whenMatched: "merge", whenNotMatched: "discard" } }]);
    res.status(201).json({ rating });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Vous avez déjà noté cette commande" });
    console.error("Create rating error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/vendor/:vendorId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.vendorId)) return res.status(400).json({ error: "Identifiant vendeur invalide" });
  const ratings = await Rating.find({ vendor: req.params.vendorId, vendorRating: { $ne: null }, flaggedAt: null }).select("vendorRating comment createdAt rater").populate("rater", "name");
  res.json(ratings);
});

router.post("/:id/flag", async (req, res) => {
  const rating = await Rating.findById(req.params.id);
  if (!rating) return res.status(404).json({ error: "Avis introuvable" });
  const order = await Order.findById(rating.order).select("vendor");
  if (req.user.role !== "admin" && String(order?.vendor || "") !== req.user.id) return res.status(403).json({ error: "Accès interdit" });
  rating.flaggedAt = new Date();
  rating.flagReason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
  await rating.save();
  res.json({ ok: true });
});

router.get("/order/:orderId", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) return res.status(400).json({ error: "Identifiant de commande invalide" });
    const order = await Order.findById(req.params.orderId).select("client livreur");
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    const allowed = String(order.client) === req.user.id || String(order.livreur || "") === req.user.id || req.user.role === "admin";
    if (!allowed) return res.status(403).json({ error: "Accès interdit" });
    const ratings = await Rating.find({ order: order._id }).sort({ createdAt: 1 }).populate("rater", "name role").populate("ratedUser", "name role");
    res.json(ratings);
  } catch (err) {
    console.error("Get order ratings error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/user/:userId", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    const user = await User.findById(req.params.userId).select("name role");
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    const stats = await Rating.aggregate([
      { $match: { ratedUser: user._id } },
      { $group: { _id: "$ratedUser", average: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    const value = stats[0] || { average: 0, count: 0 };
    res.json({ user, average: Math.round(Number(value.average) * 10) / 10, count: value.count });
  } catch (err) {
    console.error("Get user rating error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

if (!express.application.__veltoRatingsPatched) {
  express.application.__veltoRatingsPatched = true;
  const originalListen = express.application.listen;
  express.application.listen = function veltoListenWithRatings(...args) {
    if (!this.__veltoRatingsMounted) {
      this.__veltoRatingsMounted = true;
      this.use("/ratings", router);
      console.log("Ratings API actif");
    }
    return originalListen.apply(this, args);
  };
}

module.exports = Rating;
