(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const STATUS = { nouvelle: "Nouvelle", acceptee: "Acceptée", route: "En route", livree: "Livrée", annulee: "Annulée" };
  let user = null;
  let token = localStorage.getItem("velto_token") || null;
  let map = null;
  let marker = null;
  let lastStatuses = new Map();
  let lastToken = token;

  const headers = () => token ? { Authorization: `Bearer ${token}` } : {};
  function toast(message, success = false) {
    let host = document.getElementById("velto-toast-host");
    if (!host) { host = document.createElement("div"); host.id = "velto-toast-host"; host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px"; document.body.appendChild(host); }
    const item = document.createElement("div"); item.textContent = message; item.style.cssText = `padding:13px 16px;border-radius:14px;background:rgba(28,24,20,.95);color:white;box-shadow:0 10px 30px rgba(0,0,0,.18);font:500 13px Inter,Arial,sans-serif;border:1px solid ${success ? "rgba(214,178,94,.6)" : "rgba(255,255,255,.12)"}`; host.appendChild(item); setTimeout(() => item.remove(), 4200);
  }
  function nativeNotify(title, body) { if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body }); } catch {} } }
  async function loadLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const script = document.createElement("script"); script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }
  async function restoreUser() {
    if (!token) return null;
    try { const res = await fetch(`${API}/auth/me`, { headers: headers() }); if (!res.ok) return null; const data = await res.json(); return data.user || null; } catch { return null; }
  }
  async function getOrders() {
    if (!token || !user || !["client", "livreur"].includes(user.role)) return [];
    try { const res = await fetch(`${API}/orders`, { headers: headers() }); if (!res.ok) return []; const data = await res.json(); return Array.isArray(data) ? data : []; } catch { return []; }
  }
  function ensureClientPanel() {
    if (user?.role !== "client" || document.getElementById("velto-live-tracking")) return;
    const host = document.querySelector("#view-client .orders-panel"); if (!host) return;
    const panel = document.createElement("div"); panel.id = "velto-live-tracking"; panel.style.cssText = "margin-top:18px;padding-top:18px;border-top:1px solid rgba(36,28,16,.1)";
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h3 style="margin:0">Suivi en direct</h3><p id="velto-track-driver" style="margin:5px 0;color:#857a67;font-size:13px">Aucune course active.</p></div><span id="velto-track-status" class="order-status">—</span></div><div id="velto-track-map" style="height:230px;border-radius:16px;overflow:hidden;margin-top:12px"></div>`;
    host.appendChild(panel);
    loadLeaflet().then(() => { if (map || !document.getElementById("velto-track-map")) return; map = L.map("velto-track-map").setView([36.8065, 10.1815], 12); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map); }).catch(() => {});
  }
  async function refreshClient(orders) {
    ensureClientPanel();
    const active = orders.find(o => ["nouvelle", "acceptee", "route"].includes(o.status));
    const statusEl = document.getElementById("velto-track-status"), driverEl = document.getElementById("velto-track-driver");
    if (!active) { if (statusEl) statusEl.textContent = "—"; if (driverEl) driverEl.textContent = "Aucune course active."; if (marker && map) { map.removeLayer(marker); marker = null; } return; }
    try {
      const res = await fetch(`${API}/orders/${active.id}/tracking`, { headers: headers() }); if (!res.ok) return; const data = await res.json(); const label = STATUS[data.status] || data.status;
      if (statusEl) statusEl.textContent = label; if (driverEl) driverEl.textContent = data.driver ? `Livreur : ${data.driver.name}${data.driver.location ? " · GPS actif" : ""}` : "En attente d'un livreur";
      const previous = lastStatuses.get(active.id);
      if (previous && previous !== data.status) { const msg = `Commande #${String(active.id).slice(-5)} : ${label}`; toast(msg, data.status === "livree"); nativeNotify("Velto", msg); }
      lastStatuses.set(active.id, data.status);
      if (map && data.driver?.location?.lat != null && data.driver?.location?.lng != null) { const point = [Number(data.driver.location.lat), Number(data.driver.location.lng)]; if (!marker) marker = L.marker(point).addTo(map).bindPopup("Votre livreur"); else marker.setLatLng(point); map.setView(point, Math.max(map.getZoom(), 14)); }
    } catch {}
  }
  async function cancelOrder(order) {
    const reason = prompt("Pourquoi annuler cette commande ?", "Changement de programme") || "Annulée par l'utilisateur";
    try { const res = await fetch(`${API}/orders/${order.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ reason }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Impossible d'annuler la commande"); toast("Commande annulée", true); monitor(); } catch (err) { toast(err.message || "Impossible d'annuler la commande"); }
  }
  function addCancelButtons(orders) {
    if (!user || user.role !== "livreur") return;
    document.querySelectorAll(".order-card").forEach(card => {
      const idText = card.querySelector(".order-id")?.textContent || ""; const order = orders.find(o => idText.endsWith(String(o.id || "").slice(-5))); if (!order || card.querySelector(".velto-cancel")) return;
      const allowed = order.status === "acceptee" && String(order.livreur || "") === String(user.id || ""); if (!allowed) return;
      const actions = card.querySelector(".order-actions"); if (!actions) return; const btn = document.createElement("button"); btn.className = "velto-cancel"; btn.textContent = "Annuler"; btn.addEventListener("click", () => cancelOrder(order)); actions.appendChild(btn);
    });
  }
  async function syncSession() {
    const currentToken = localStorage.getItem("velto_token") || null;
    if (currentToken === lastToken && user) return true;
    lastToken = currentToken; token = currentToken;
    user = await restoreUser();
    if (!user) { if (marker && map) { map.removeLayer(marker); marker = null; } return false; }
    if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch {} }
    return true;
  }
  async function monitor() {
    if (!(await syncSession()) || !user || !token) return;
    const orders = await getOrders();
    if (user.role === "client") await refreshClient(orders);
    addCancelButtons(orders);
  }
  monitor();
  setInterval(monitor, 3000);
})();