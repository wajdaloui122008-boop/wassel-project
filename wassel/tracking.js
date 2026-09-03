(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const STATUS = { nouvelle: "Nouvelle", acceptee: "Acceptée", route: "En route", livree: "Livrée", annulee: "Annulée" };
  const FLOW = ["nouvelle", "acceptee", "route", "livree"];
  let user = null, token = localStorage.getItem("velto_token") || null, map = null, marker = null;
  let lastStatuses = new Map(), lastToken = token, monitorBusy = false;
  const headers = () => token ? { Authorization: `Bearer ${token}` } : {};
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" }[c]));
  const toast = (message, success = false) => {
    let host = document.getElementById("velto-toast-host");
    if (!host) { host = document.createElement("div"); host.id = "velto-toast-host"; host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px"; document.body.appendChild(host); }
    const item = document.createElement("div"); item.textContent = message; item.style.cssText = `padding:13px 16px;border-radius:14px;background:rgba(28,24,20,.95);color:white;box-shadow:0 10px 30px rgba(0,0,0,.18);font:500 13px Inter,Arial,sans-serif;border:1px solid ${success ? "rgba(214,178,94,.6)" : "rgba(255,255,255,.12)"}`; host.appendChild(item); setTimeout(() => item.remove(), 4200);
  };
  const notify = (title, body) => { if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body }); } catch {} } };
  const formatTime = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-TN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); };
  async function loadLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const script = document.createElement("script"); script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }
  async function restoreUser() {
    if (!token) return null;
    try { const r = await fetch(`${API}/auth/me`, { headers: headers() }); if (!r.ok) return null; const d = await r.json(); return d.user || null; } catch { return null; }
  }
  async function getOrders() {
    if (!token || !user || !["client", "livreur"].includes(user.role)) return [];
    try { const r = await fetch(`${API}/orders`, { headers: headers() }); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; } catch { return []; }
  }
  function ensureClientPanel() {
    if (user?.role !== "client" || document.getElementById("velto-live-tracking")) return;
    const host = document.querySelector("#view-client .orders-panel"); if (!host) return;
    const panel = document.createElement("div"); panel.id = "velto-live-tracking"; panel.style.cssText = "margin-top:18px;padding-top:18px;border-top:1px solid rgba(36,28,16,.1)";
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h3 style="margin:0">Suivi en direct</h3><p id="velto-track-driver" style="margin:5px 0;color:#857a67;font-size:13px">Aucune course active.</p></div><span id="velto-track-status" class="order-status">—</span></div><div id="velto-track-progress" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px"></div><div id="velto-track-history" style="margin-top:14px;display:flex;flex-direction:column;gap:7px"></div><div id="velto-track-meta" style="margin-top:10px;color:#857a67;font-size:13px"></div><div id="velto-track-map" style="height:230px;border-radius:16px;overflow:hidden;margin-top:12px"></div>`;
    host.appendChild(panel);
    loadLeaflet().then(() => { if (map || !document.getElementById("velto-track-map")) return; map = L.map("velto-track-map").setView([36.8065, 10.1815], 12); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map); }).catch(() => {});
  }
  function renderProgress(status) {
    const el = document.getElementById("velto-track-progress"); if (!el) return;
    if (status === "annulee") { el.innerHTML = `<div style="grid-column:1/-1;padding:10px;border-radius:12px;background:#f6eeee;font-weight:700">❌ Commande annulée</div>`; return; }
    const index = FLOW.indexOf(status);
    el.innerHTML = FLOW.map((key, i) => `<div style="padding:9px 4px;text-align:center;border-radius:10px;background:${i <= index ? "#211d18" : "#eee"};color:${i <= index ? "#fff" : "#857a67"};font-size:11px;font-weight:700">${i < index ? "✓ " : ""}${STATUS[key]}</div>`).join("");
  }
  function renderHistory(history, fallback) {
    const el = document.getElementById("velto-track-history"); if (!el) return;
    const events = Array.isArray(history) && history.length ? history : [{ status: fallback, at: null }];
    el.innerHTML = `<div style="font-size:12px;font-weight:800;margin-bottom:2px">Historique</div>` + events.map((e, i) => `<div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:11px;background:${i === events.length - 1 ? "rgba(214,178,94,.12)" : "rgba(0,0,0,.035)"}"><span style="width:8px;height:8px;border-radius:50%;background:${i === events.length - 1 ? "#d6b25e" : "#aaa"};flex:0 0 auto"></span><strong style="font-size:12px">${esc(STATUS[e.status] || e.status)}</strong><span style="margin-left:auto;color:#857a67;font-size:11px">${formatTime(e.at)}</span></div>`).join("");
  }
  async function refreshClient(orders) {
    ensureClientPanel();
    const active = orders.filter(o => ["nouvelle", "acceptee", "route"].includes(o.status)).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    const statusEl = document.getElementById("velto-track-status"), driverEl = document.getElementById("velto-track-driver"), metaEl = document.getElementById("velto-track-meta");
    if (!active) { if (statusEl) statusEl.textContent = "—"; if (driverEl) driverEl.textContent = "Aucune course active."; if (metaEl) metaEl.textContent = ""; renderProgress("nouvelle"); renderHistory([], "nouvelle"); if (marker && map) { map.removeLayer(marker); marker = null; } return; }
    try {
      const r = await fetch(`${API}/orders/${encodeURIComponent(active.id)}/tracking`, { headers: headers() }); if (!r.ok) return;
      const data = await r.json(), label = STATUS[data.status] || data.status;
      if (statusEl) statusEl.textContent = label;
      if (driverEl) driverEl.textContent = data.driver ? `Livreur : ${esc(data.driver.name)}${data.driver.location ? " · GPS actif" : ""}` : "En attente d'un livreur";
      if (metaEl) { const bits=[]; if (Number.isFinite(Number(data.distanceKm))) bits.push(`Distance : ${Number(data.distanceKm).toFixed(1)} km`); if (Number.isFinite(Number(data.estimatedDurationMin))) bits.push(`Durée estimée : ${Math.max(1, Math.round(Number(data.estimatedDurationMin)))} min`); metaEl.textContent=bits.join(" · "); }
      renderProgress(data.status); renderHistory(data.statusHistory || active.statusHistory || [], data.status);
      const previous = lastStatuses.get(active.id);
      if (previous && previous !== data.status) { const msg=`Commande #${String(active.id).slice(-5)} : ${label}`; toast(msg, data.status === "livree"); notify("Velto", msg); }
      lastStatuses.set(active.id, data.status);
      if (map && data.driver?.location?.lat != null && data.driver?.location?.lng != null) { const point=[Number(data.driver.location.lat),Number(data.driver.location.lng)]; if (!marker) marker=L.marker(point).addTo(map).bindPopup("Votre livreur"); else marker.setLatLng(point); map.setView(point, Math.max(map.getZoom(),14)); }
    } catch {}
  }
  async function cancelOrder(order) {
    const reason = prompt("Pourquoi annuler cette commande ?", "Changement de programme") || "Annulée par l'utilisateur";
    try { const r=await fetch(`${API}/orders/${encodeURIComponent(order.id)}/cancel`,{method:"POST",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({reason})}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||"Impossible d'annuler la commande"); toast("Commande annulée",true); await monitor(); } catch(e) { toast(e.message||"Impossible d'annuler la commande"); }
  }
  function addCancelButtons(orders) {
    if (user?.role !== "livreur") return;
    document.querySelectorAll(".order-card").forEach(card => {
      const idText=card.querySelector(".order-id")?.textContent||""; const order=orders.find(o=>idText.endsWith(String(o.id||"").slice(-5))); if(!order||card.querySelector(".velto-cancel")) return;
      if(order.status!=="acceptee"||String(order.livreur||"")!==String(user.id||"")) return;
      const actions=card.querySelector(".order-actions"); if(!actions)return; const btn=document.createElement("button"); btn.className="velto-cancel"; btn.textContent="Annuler"; btn.addEventListener("click",()=>cancelOrder(order)); actions.appendChild(btn);
    });
  }
  async function syncSession() {
    const current=localStorage.getItem("velto_token")||null; if(current===lastToken&&user)return true;
    lastToken=current; token=current; user=await restoreUser();
    if(!user){if(marker&&map){map.removeLayer(marker);marker=null;}return false;}
    if("Notification" in window&&Notification.permission==="default"){try{await Notification.requestPermission();}catch{}}
    return true;
  }
  async function monitor() {
    if(monitorBusy)return; monitorBusy=true;
    try { if(!(await syncSession())||!user||!token)return; const orders=await getOrders(); if(user.role==="client")await refreshClient(orders); addCancelButtons(orders); } finally { monitorBusy=false; }
  }
  monitor(); setInterval(monitor,3000);
})();
