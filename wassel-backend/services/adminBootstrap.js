const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/stats", async (_req, res) => {
  try {
    const [users, orders, onlineDrivers, revenue] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: { $in: ["livreur", "taxi"] }, isOnline: true }),
      Order.aggregate([{ $match: { status: "livree" } }, { $group: { _id: null, total: { $sum: { $ifNull: ["$price", 0] } } } }])
    ]);
    res.json({ users, orders, onlineDrivers, revenue: revenue[0]?.total || 0 });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const users = await User.find().select("name email role phone country capabilities isOnline isAvailable createdAt location").sort({ createdAt: -1 }).limit(limit).lean();
    res.json(users);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const orders = await Order.find().populate("client", "name phone").populate("livreur", "name phone role").sort({ createdAt: -1 }).limit(limit).lean();
    res.json(orders);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
