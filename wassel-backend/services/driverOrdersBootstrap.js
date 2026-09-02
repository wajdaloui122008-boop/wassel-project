const express = require("express");
const Order = require("../models/Order");
const { requireAuth, requireRole } = require("../middleware/auth");

if (!express.application.__veltoDriverOrdersMounted) {
  express.application.__veltoDriverOrdersMounted = true;
  const originalListen = express.application.listen;
  express.application.listen = function veltoDriverOrdersListen(...args) {
    this.get("/drivers/me/active-order", requireAuth, requireRole("livreur"), async (req, res) => {
      try {
        const order = await Order.findOne({
          livreur: req.user.id,
          status: { $in: ["acceptee", "route"] },
        }).sort({ createdAt: -1 });
        res.json({ order: order || null });
      } catch (err) {
        console.error("Active driver order error:", err);
        res.status(500).json({ error: "Erreur serveur" });
      }
    });
    console.log("Driver active-order API actif");
    return originalListen.apply(this, args);
  };
}
