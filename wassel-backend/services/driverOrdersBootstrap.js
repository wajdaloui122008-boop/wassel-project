const express = require("express");
const Order = require("../models/Order");
const { requireAuth } = require("../middleware/auth");
const { requireDriver } = require("./driverRole");
const User = require("../models/User");

// Older livreur accounts may have been created before the capabilities field
// existed. Keep dispatch compatible with those accounts instead of silently
// excluding them from every service offer.
if (!User.__veltoLegacyCapabilitiesPatched) {
  User.__veltoLegacyCapabilitiesPatched = true;
  const originalFind = User.find.bind(User);
  User.find = function veltoDriverFind(conditions, ...args) {
    if (conditions && typeof conditions === "object" && typeof conditions.capabilities === "string") {
      const service = conditions.capabilities;
      const next = { ...conditions };
      delete next.capabilities;
      next.$or = [
        { capabilities: service },
        { capabilities: { $exists: false } },
        { capabilities: { $size: 0 } },
      ];
      return originalFind(next, ...args);
    }
    return originalFind(conditions, ...args);
  };
}

if (!express.application.__veltoDriverOrdersMounted) {
  express.application.__veltoDriverOrdersMounted = true;
  const originalListen = express.application.listen;
  express.application.listen = function veltoDriverOrdersListen(...args) {
    this.get("/drivers/me/active-order", requireAuth, requireDriver, async (req, res) => {
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
