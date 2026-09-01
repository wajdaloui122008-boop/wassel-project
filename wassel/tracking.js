(() => {
  const TRACKING_LEAFLET_VERSION = "1.9.4";
  let trackingMap = null;
  let trackingMarker = null;
  let trackingTimer = null;
  let lastStatuses = new Map();
  let notificationsReady = false;

  function esc(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function toast(message, type = "info") {
    let host = document.getElementById("velto-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "velto-toast-host";
      host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 40px));";
      document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.textContent = message;
    item.style.cssText = "padding:13px 16px;border-radius:14px;background:rgba(28,24,20,.94);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.18);font:500 13px Inter,Arial,sans-serif;opacity:0;transform:translateY(8px);transition:.2s;";
    if (type === "success") item.style.border = "1px solid rgba(214,178,94,.55)";
    host.appendChild(item);
    requestAnimationFrame(() => { item.style.opacity = "1"; item.style.transform = "translateY(0)"; });
    setTimeout(() => { item.style.opacity = "0"; item.style.transform = "translateY(8px)"; setTimeout(() => item.remove(), 250); }, 4200);
  }

  async function loadLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `https://unpkg.com/leaflet@${TRACKING_LEAFLET_VERSION}/dist/leaflet.css`;
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = `https://unpkg.com/leaflet@${TRACKING_LEAFLET_VERSION}/dist/leaflet.js`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function activeClientOrder() {
    if (!window.currentUser || window.currentUser.role !== "client" || !Array.isArray(window.orders)) return null;
    return window.orders.find((o) => ["nouvelle", "acceptee", "route"].includes(o.status)) || null;
  }

  async function refreshTracking(order) {
    if (!order || !window.authToken) return;
    try {
      const res = await fetch(`${window.API_URL || "https://wassel-backend-ds3n.onrender.com"}/orders/${order.id}/tracking`, { headers: window.authHeaders ? window.authHeaders() : {} });
      if (!res.ok) return;
      const data = await res.json();
      const driver = data.driver;
      const status = data.status;
      const previous = lastStatuses.get(order.id);
      if (previous && previous !== status) {
        const label = (window.STATUS_LABELS && window.STATUS_LABELS[status]) || status;
        toast(`Commande #${String(order.id).slice(-5)} : ${label}`, status === "livree" ? "success" : "info");
        notifyNative(`Velto — ${label}`, `Votre commande #${String(order.id).slice(-5)} est maintenant « ${label} ».`);
      }
      lastStatuses.set(order.id, status);
      const statusEl = document.getElementById("live-tracking-status");
      const driverEl = document.getElementById("live-tracking-driver");
      if (statusEl) statusEl.textContent = (window.STATUS_LABELS && window.STATUS_LABELS[status]) || status;
      if (driverEl) driverEl.textContent = driver ? `Livreur : ${driver.name}${driver.location ? " · GPS actif" : ""}` : "En attente d'un livreur";
      if (trackingMap && driver?.location?.lat != null && driver?.location?.lng != null) {
        const point = [Number(driver.location.lat), Number(driver.location.lng)];
        if (!trackingMarker) trackingMarker = L.marker(point).addTo(trackingMap).bindPopup("Livreur");
        else trackingMarker.setLatLng(point);
        if (!trackingMap._veltoCentered) { trackingMap.setView(point, 14); trackingMap._veltoCentered = true; }
      }
    } catch (err) { console.debug("Tracking refresh failed", err); }
  }

  function buildTrackingPanel() {
    if (document.getElementById("velto-live-tracking")) return;
    const host = document.querySelector("#view-client .orders-panel");
    if (!host) return;
    const panel = document.createElement("div");
    panel.id = "velto-live-tracking";
    panel.style.cssText = "margin-top:18px;padding-top:18px;border-top:1px solid rgba(36,28,16,.1);";
    panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><h3 style="margin:0">Suivi en direct</h3><p id="live-tracking-driver" style="margin:5px 0;color:#857a67;font-size:13px">Aucune course active.</p></div><span id="live-tracking-status" class="order-status">—</span></div><div id="velto-tracking-map" style="height:220px;border-radius:16px;overflow:hidden;margin-top:12px;background:#eee"></div>`;
    host.appendChild(panel);
    loadLeaflet().then(() => {
      if (!document.getElementById("velto-tracking-map") || trackingMap) return;
      trackingMap = L.map("velto-tracking-map").setView([36.8065, 10.1815], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(trackingMap);
    }).catch(() => {});
  }

  async function requestNativePermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
  }

  function notifyNative(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try { new Notification(title, { body, icon: "" }); } catch {}
  }

  function addCancelButton(card, order) {
    if (!card || !window.currentUser) return;
    const actions = card.querySelector(".order-actions");
    if (!actions || actions.querySelector(".velto-cancel")) return;
    const allowed = window.currentUser.role === "client" && ["nouvelle", "acceptee"].includes(order.status) || window.currentUser.role === "livreur" && order.livreur && ["acceptee"].includes(order.status);
    if (!allowed) return;
    const btn = document.createElement("button");
    btn.className = "velto-cancel";
    btn.textContent = "Annuler";
    btn.addEventListener("click", async () => {
      const reason = window.prompt("Pourquoi annuler cette commande ?", "Changement de programme") || "Annulée par l'utilisateur";
      try {
        const res = await fetch(`${window.API_URL || "https://wassel-backend-ds3n.onrender.com"}/orders/${order.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", ...(window.authHeaders ? window.authHeaders() : {}) }, body: JSON.stringify({ reason }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible d'annuler la commande");
        toast("Commande annulée", "success");
        if (typeof window.fetchOrders === "function") window.fetchOrders();
      } catch (err) { toast(err.message || "Impossible d'annuler la commande"); }
    });
    actions.appendChild(btn);
  }

  function decorateCards() {
    if (!Array.isArray(window.orders)) return;
    document.querySelectorAll(".order-card").forEach((card) => {
      const idText = card.querySelector(".order-id")?.textContent || "";
      const order = window.orders.find((o) => idText.endsWith(String(o.id || "").slice(-5)));
      if (order) addCancelButton(card, order);
    });
  }

  function monitor() {
    if (!window.currentUser) return;
    if (window.currentUser.role === "client") {
      buildTrackingPanel();
      const active = activeClientOrder();
      if (active) refreshTracking(active);
      else {
        const statusEl = document.getElementById("live-tracking-status");
        const driverEl = document.getElementById("live-tracking-driver");
        if (statusEl) statusEl.textContent = "—";
        if (driverEl) driverEl.textContent = "Aucune course active.";
        if (trackingMarker && trackingMap) { trackingMap.removeLayer(trackingMarker); trackingMarker = null; }
      }
    }
    decorateCards();
  }

  async function setup() {
    if (notificationsReady) return;
    notificationsReady = true;
    await requestNativePermission();
    setInterval(monitor, 2500);
    monitor();
  }

  window.addEventListener("beforeunload", () => { if (trackingTimer) clearInterval(trackingTimer); });
  setup();
})();