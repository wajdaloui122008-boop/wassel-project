const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/stats", async (_req, res) => {
  try {
    const [users, orders, onlineDrivers, byStatus] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: { $in: ["livreur", "taxi"] }, isOnline: true, isAvailable: true }),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);
    res.json({ users, orders, onlineDrivers, byStatus });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const users = await User.find().select("name email role phone country capabilities isOnline isAvailable location createdAt").sort({ createdAt: -1 }).limit(limit);
    res.json(users);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const orders = await Order.find().sort({ createdAt: -1 }).limit(limit).populate("client", "name phone").populate("livreur", "name phone role");
    res.json(orders);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
