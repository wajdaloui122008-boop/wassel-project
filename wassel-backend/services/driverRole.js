const mongoose = require("mongoose");
const User = require("../models/User");

const DEFAULT_DRIVER_CAPABILITIES = ["colis", "food", "taxi", "shop", "market"];

async function backfillLegacyCapabilities(userId) {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await User.updateOne(
      { _id: userId, role: "livreur", $or: [{ capabilities: { $exists: false } }, { capabilities: { $size: 0 } }] },
      { $set: { capabilities: DEFAULT_DRIVER_CAPABILITIES } },
    );
  } catch (error) {
    console.error("Driver capabilities backfill error:", error.message);
  }
}

function requireDriver(req, res, next) {
  if (!req.user || !["livreur", "taxi"].includes(req.user.role)) {
    return res.status(403).json({ error: "Accès réservé aux chauffeurs" });
  }
  void backfillLegacyCapabilities(req.user.id);
  return next();
}

module.exports = { requireDriver };
