const express = require("express");
const mongoose = require("mongoose");

const SERVICES = ["colis", "food", "taxi", "shop", "market"];

if (!express.application.__veltoDriverCapabilitiesPatched) {
  express.application.__veltoDriverCapabilitiesPatched = true;
  const originalPatch = express.application.patch;
  express.application.patch = function veltoPatch(path, ...handlers) {
    if (path === "/drivers/me/status") {
      const User = require("../models/User");
      const originalHandlers = handlers;
      handlers = [async (req, res, next) => {
        try {
          if (req.user?.role === "livreur" && mongoose.connection.readyState === 1) {
            const user = await User.findById(req.user.id).select("capabilities");
            if (user && (!Array.isArray(user.capabilities) || user.capabilities.length === 0)) {
              await User.updateOne({ _id: user._id }, { $set: { capabilities: SERVICES } });
            }
          }
        } catch (error) {
          console.error("Driver capabilities backfill error:", error.message);
        }
        return next();
      }, ...originalHandlers];
    }
    return originalPatch.call(this, path, ...handlers);
  };
}
