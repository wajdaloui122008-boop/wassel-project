const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");

const STATUS_COPY = {
  nouvelle: ["Commande reçue", "Votre commande a été placée."],
  acceptee: ["Commande confirmée", "Votre commande a été confirmée."],
  route: ["En route", "Votre commande est en route."],
  livree: ["Commande livrée", "Votre commande a été livrée."],
  annulee: ["Commande annulée", "Votre commande a été annulée."],
};

async function notifyUser({ recipient, type, orderId = null, title, body, idempotencyKey }) {
  if (!recipient || !mongoose.isValidObjectId(recipient)) return null;
  try {
    const notification = await Notification.create({ recipient, type, orderId, title, body, idempotencyKey });
    const user = await User.findById(recipient).select("+pushToken notificationPreferences").lean();
    if (user?.pushToken && (type === "order-status" || type === "dispatch-offer" ? user.notificationPreferences?.transactionalPush !== false : user.notificationPreferences?.marketingPush !== false)) {
      const { sendPush } = require("./pushNotifications");
      try {
        await sendPush(user.pushToken, { title, body, data: { type, orderId: orderId ? String(orderId) : "" } });
      } catch (error) {
        console.error("Push notification error:", error.message);
      }
    }
    return notification;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function notifyOrderStatus(order, status) {
  const copy = STATUS_COPY[status];
  if (!copy) return;
  const recipients = [order.client, order.vendor, order.livreur].filter(Boolean).map(String);
  await Promise.all([...new Set(recipients)].map((recipient) => notifyUser({
    recipient,
    type: "order-status",
    orderId: order._id,
    title: copy[0],
    body: copy[1],
    idempotencyKey: `order-status:${order._id}:${status}:${recipient}`,
  })));
}

module.exports = { notifyUser, notifyOrderStatus };
