async function sendDriverOfferPush(token, payload) {
  return sendPush(token, { title: "Nouvelle course", body: `${payload.pickup || "Départ"} → ${payload.dropoff || "Destination"}`, data: { type: "driver-offer", orderId: String(payload.orderId) } });
}

async function sendPush(token, payload) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey || !token || typeof fetch !== "function") return false;
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: { Authorization: `key=${serverKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: token,
      priority: "high",
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
    }),
  });
  if (!response.ok) throw new Error(`FCM responded with ${response.status}`);
  return true;
}

module.exports = { sendDriverOfferPush, sendPush };
