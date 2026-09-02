const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  const provider = String(process.env.PAYMENT_PROVIDER || "mock").trim().toLowerCase();
  res.json({
    provider,
    stripePublishableKey: provider === "stripe" ? (process.env.STRIPE_PUBLISHABLE_KEY || null) : null,
    configured: provider !== "stripe" || Boolean(process.env.STRIPE_SECRET_KEY)
  });
});

module.exports = router;
