(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  let socket = null;
  let token = localStorage.getItem("velto_token") || null;
  let watched = new Set();
  let refreshTimer = null;
  let syncInFlight = false;
  const lastStatus = new Map();
  const notifiedOffers = new Map();
  const OFFER_DEDUPE_MS = 120000;

  function loadSocketIO() {
    if (window.io) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.socket.io/4.8.1/socket.io.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function getActiveOrders() {
    if (!token) return [];
    try {
      const res = await fetch(`${API}/orders`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const orders = await res.json();
      return Array.isArray(orders) ? orders.filter((o) => ["nouvelle", "acceptee", "route"].includes(o.status)) : [];
    } catch { return []; }
  }

  async function syncSubscriptions() {
    if (!socket?.connected || !token || syncInFlight) return;
    syncInFlight = true;
    try {
      const orders = await getActiveOrders();
      if (!socket?.connected || !token) return;
      const next = new Set(orders.map((o) => String(o.id || o._id)).filter(Boolean));
      for (const id of next) if (!watched.has(id)) socket.emit("order:watch", id);
      for (const id of watched) if (!next.has(id)) socket.emit("order:unwatch", id);
      watched = next;
    } finally {
      syncInFlight = false;
    }
  }

  function watchOrder(orderId) {
    const id = String(orderId || "");
    if (!id) return;
    watched.add(id);
    if (socket?.connected) socket.emit("order:watch", id);
  }

  function notify(title, body, tag) {
    try {
      if (document.visibilityState === "visible" && !document.hidden) {
        let box = document.getElementById("velto-live-toast");
        if (!box) { box = document.createElement("div"); box.id = "velto-live-toast"; box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:100000;max-width:360px;padding:14px 16px;border-radius:16px;background:#211d18;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.25);font:600 13px Inter,Arial"; document.body.appendChild(box); }
        box.innerHTML = `<strong>${escapeHtml(title)}</strong><div style="margin-top:4px;opacity:.82;font-weight:500">${escapeHtml(body)}</div>`;
        clearTimeout(box._timer); box._timer = setTimeout(() => box.remove(), 4500);
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body, tag });
    } catch {}
  }

  function escapeHtml(v) { return String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  async function requestNotifications() {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    try { await Notification.requestPermission(); } catch {}
  }

  function handleOrder(snapshot) {
    if (!snapshot) return;
    const id = String(snapshot.id || snapshot._id || "");
    const status = snapshot.status;
    if (id && status) {
      const previous = lastStatus.get(id);
      lastStatus.set(id, status);
      if (previous && previous !== status) {
        const labels = { acceptee: "Course acceptée", route: "Course en route", livree: "Course terminée", annulee: "Course annulée" };
        notify(labels[status] || "Commande mise à jour", `Statut : ${status}`, `order-${id}-${status}`);
      }
    }
    window.dispatchEvent(new CustomEvent("velto:realtime-order", { detail: snapshot }));
  }

  function handleOffer(offer) {
    const id = String(offer?.order?.id || offer?.order?._id || offer?.id || "");
    const now = Date.now();
    for (const [offerId, seenAt] of notifiedOffers) {
      if (now - seenAt > OFFER_DEDUPE_MS) notifiedOffers.delete(offerId);
    }
    if (id && notifiedOffers.has(id)) return;
    if (id) notifiedOffers.set(id, now);
    const order = offer?.order || {};
    const label = order.serviceType === "taxi" ? "Nouvelle course taxi" : "Nouvelle course livreur";
    notify(label, `${order.pickup || "Départ"} → ${order.dropoff || "Destination"}`, `offer-${id || now}`);
    window.dispatchEvent(new CustomEvent("velto:realtime-offer", { detail: offer }));
  }

  function connect() {
    if (!window.io || !token) return;
    if (socket) socket.disconnect();
    socket = window.io(API, { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("connect", syncSubscriptions);
    socket.on("order:snapshot", handleOrder);
    socket.on("order:update", handleOrder);
    socket.on("driver:offer", handleOffer);
    socket.on("connect_error", () => {});
  }

  async function boot() {
    token = localStorage.getItem("velto_token") || null;
    if (!token) { if (socket) socket.disconnect(); watched.clear(); return; }
    try { await loadSocketIO(); connect(); requestNotifications(); } catch {}
  }

  window.__veltoRealtimeWatchOrder = watchOrder;
  window.addEventListener("storage", (event) => {
    if (event.key === "velto_token") { token = localStorage.getItem("velto_token") || null; boot(); }
  });
  window.addEventListener("velto:auth", () => boot());
  document.addEventListener("click", requestNotifications, { once: true });

  boot();
  if (!refreshTimer) refreshTimer = setInterval(() => {
    const current = localStorage.getItem("velto_token") || null;
    if (current !== token) { token = current; boot(); }
    else syncSubscriptions();
  }, 5000);
})();
