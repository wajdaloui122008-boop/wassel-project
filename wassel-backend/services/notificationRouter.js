const express = require("express");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.get("/", async (req, res) => {
  const notifications = await Notification.find({ recipient: req.user.id }).sort({ createdAt: -1 }).limit(100);
  res.json(notifications);
});
router.patch("/preferences", async (req, res) => {
  const preferences = await User.findByIdAndUpdate(req.user.id, { $set: { "notificationPreferences.marketingPush": Boolean(req.body.marketingPush), "notificationPreferences.transactionalPush": true } }, { returnDocument: "after", runValidators: true }).select("notificationPreferences");
  res.json(preferences.notificationPreferences);
});
router.patch("/:id/read", async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { readAt: new Date() } }, { returnDocument: "after" });
  if (!notification) return res.status(404).json({ error: "Notification introuvable" });
  res.json(notification);
});
module.exports = router;
