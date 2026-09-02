const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const ratingSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rater: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ratedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
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
    const score = Number(req.body.rating);
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) : "";
    if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ error: "Identifiant de commande invalide" });
    if (!Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ error: "La note doit être comprise entre 1 et 5" });

    const order = await Order.findById(orderId).select("client livreur status serviceType");
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    if (order.status !== "livree") return res.status(409).json({ error: "La commande doit être livrée avant de laisser une note" });

    const me = String(req.user.id);
    const clientId = String(order.client);
    const driverId = order.livreur ? String(order.livreur) : "";
    let ratedUser;
    if (me === clientId && driverId) ratedUser = driverId;
    else if (me === driverId) ratedUser = clientId;
    else return res.status(403).json({ error: "Vous ne pouvez noter que les participants à cette commande" });

    const rating = await Rating.create({ order: order._id, rater: req.user.id, ratedUser, rating: score, comment });
    res.status(201).json({ rating });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Vous avez déjà noté cette commande" });
    console.error("Create rating error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
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
