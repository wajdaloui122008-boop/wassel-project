(() => {
  "use strict";
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const active = ["nouvelle", "acceptee", "route"];
  const labels = { nouvelle: "Commande reçue", acceptee: "Livreur accepté", route: "En route", livree: "Livrée", annulee: "Annulée" };
  let timer = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  function ensurePanel() {
    const ordersPanel = document.querySelector("#view-client .client-history");
    if (!ordersPanel || document.getElementById("velto-tracking-summary")) return;
    const section = document.createElement("section");
    section.id = "velto-tracking-summary";
    section.style.cssText = "margin-top:14px;padding-top:14px;border-top:1px solid rgba(36,28,16,.1)";
    section.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h3 style="margin:0">📦 Suivi de commande</h3><p id="vts-status" style="margin:5px 0;color:#857a67;font-size:13px">Chargement…</p></div><button id="vts-refresh" type="button" class="btn-ghost">Actualiser</button></div><div id="vts-route" style="margin-top:10px"></div>`;
    ordersPanel.append(section);
    section.querySelector("#vts-refresh").onclick = () => refresh(true);
  }

  async function refresh(showLoading = false) {
    if (!token()) return;
    ensurePanel();
    const box = document.getElementById("velto-tracking-summary");
    if (!box) return;
    const status = box.querySelector("#vts-status");
    const route = box.querySelector("#vts-route");
    if (showLoading) status.textContent = "Actualisation…";
    try {
      const response = await fetch(`${API}/orders?limit=20`, { headers: headers() });
      if (!response.ok) throw new Error("Impossible de récupérer les commandes.");
      const orders = await response.json();
      const list = Array.isArray(orders) ? orders : (Array.isArray(orders.orders) ? orders.orders : []);
      const order = list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).find(o => active.includes(o.status)) || list[0];
      if (!order) {
        status.textContent = "Aucune commande à suivre.";
        route.innerHTML = "";
        return;
      }
      status.innerHTML = `<strong>${escapeHtml(labels[order.status] || order.status)}</strong> · #${escapeHtml(String(order.id || order._id || "").slice(-8))}`;
      const driver = order.livreur?.name || order.driver?.name;
      route.innerHTML = `<div style="display:grid;gap:8px"><div><small style="color:#857a67">RETRAIT</small><br><b>${escapeHtml(order.pickup)}</b></div><div style="text-align:center;opacity:.55">↓</div><div><small style="color:#857a67">DESTINATION</small><br><b>${escapeHtml(order.dropoff)}</b></div>${driver ? `<div style="margin-top:4px;padding:9px;border-radius:10px;background:rgba(255,255,255,.55)">🛵 Livreur : <b>${escapeHtml(driver)}</b></div>` : ""}</div>`;
    } catch (error) {
      status.textContent = error.message || "Erreur de suivi.";
    }
  }

  function start() {
    if (!token() || timer) return;
    refresh();
    timer = setInterval(refresh, 10000);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  window.addEventListener("velto:auth", () => token() ? start() : stop());
  const observer = new MutationObserver(() => { if (token()) { ensurePanel(); start(); } });
  observer.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
