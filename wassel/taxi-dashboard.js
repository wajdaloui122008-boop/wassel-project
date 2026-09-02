(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => ({ Authorization: `Bearer ${token()}` });
  let online = false;
  let available = false;
  let gpsWatch = null;
  let timer = null;
  let activeOrder = null;

  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  async function api(path, options = {}) {
    const res = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur serveur");
    return data;
  }

  function mount() {
    const view = document.getElementById("view-taxi");
    if (!view || view.dataset.ready) return;
    view.dataset.ready = "1";
    view.innerHTML = `<div class="glass-panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><div style="font-size:40px">🚕</div><h1>Espace Chauffeur Taxi</h1><p class="subtitle">Recevez les courses proches et gérez votre trajet depuis ici.</p></div><button id="taxi-online" class="btn-primary">Passer en ligne</button></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0"><div class="glass-panel"><b>Statut</b><p id="taxi-status">Hors ligne</p></div><div class="glass-panel"><b>GPS</b><p id="taxi-gps">Non connecté</p></div><div class="glass-panel"><b>Courses</b><p id="taxi-count">0</p></div></div><section id="taxi-active" class="glass-panel" style="margin-bottom:16px;display:none"></section><div id="taxi-offers" class="orders-list"><p class="empty-state">Passez en ligne pour recevoir des courses.</p></div></div>`;
    document.getElementById("taxi-online").onclick = toggleOnline;
    syncState();
    refreshActiveOrder();
  }

  async function syncState() {
    if (window.__veltoUser?.role !== "taxi") return;
    try {
      const me = await api("/auth/me");
      online = Boolean(me.user?.isOnline);
      available = Boolean(me.user?.isAvailable);
      renderStatus();
      if (online) startGPS();
    } catch {}
  }

  function renderStatus() {
    const button = document.getElementById("taxi-online");
    const status = document.getElementById("taxi-status");
    if (!button || !status) return;
    button.textContent = online ? "Passer hors ligne" : "Passer en ligne";
    status.textContent = online && available ? "🟢 En ligne · disponible" : online ? "🟡 En ligne · course en cours" : "⚪ Hors ligne";
  }

  async function toggleOnline() {
    try {
      const next = !online;
      const data = await api("/drivers/me/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOnline: next, isAvailable: next }) });
      online = Boolean(data.user?.isOnline);
      available = Boolean(data.user?.isAvailable);
      renderStatus();
      if (online) startGPS(); else stopGPS();
      refreshOffers();
    } catch (err) { alert(err.message); }
  }

  function startGPS() {
    if (!navigator.geolocation || gpsWatch !== null) return;
    gpsWatch = navigator.geolocation.watchPosition(async p => {
      try {
        await api("/drivers/me/location", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }) });
        const el = document.getElementById("taxi-gps"); if (el) el.textContent = "🟢 GPS actif";
      } catch {}
    }, () => { const el = document.getElementById("taxi-gps"); if (el) el.textContent = "🔴 GPS refusé"; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function stopGPS() { if (gpsWatch !== null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; const el = document.getElementById("taxi-gps"); if (el) el.textContent = "Non connecté"; }

  async function refreshActiveOrder() {
    if (window.__veltoUser?.role !== "taxi") return;
    try {
      const data = await api("/drivers/me/active-order");
      activeOrder = data.order || null;
      renderActiveOrder();
      if (activeOrder) {
        available = false;
        renderStatus();
      }
    } catch {}
  }

  function renderActiveOrder() {
    const host = document.getElementById("taxi-active");
    if (!host) return;
    if (!activeOrder) { host.style.display = "none"; host.innerHTML = ""; return; }
    host.style.display = "block";
    const next = activeOrder.status === "acceptee" ? "route" : "livree";
    const nextLabel = next === "route" ? "🚗 Démarrer le trajet" : "✓ Terminer la course";
    host.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><div style="font-size:13px;opacity:.7">COURSE ACTIVE · #${esc(String(activeOrder.id || "").slice(-6))}</div><h2 style="margin:5px 0">${activeOrder.status === "acceptee" ? "Chauffeur assigné" : "En route"}</h2></div><span class="badge">${esc(activeOrder.status)}</span></div><div style="display:grid;gap:8px;margin:14px 0"><div>📍 <b>Retrait</b><br>${esc(activeOrder.pickup)}</div><div>🏁 <b>Destination</b><br>${esc(activeOrder.dropoff)}</div><div>💰 <b>${Number(activeOrder.fee || 0).toFixed(2)} ${esc(activeOrder.currency || "TND")}</b> · ${Number(activeOrder.distanceKm || 0).toFixed(1)} km</div></div><div class="order-actions"><button class="accent" id="taxi-next-status">${nextLabel}</button><button id="taxi-nav">🧭 Navigation</button></div>`;
    document.getElementById("taxi-next-status").onclick = () => updateActiveStatus(next);
    document.getElementById("taxi-nav").onclick = () => openNavigation(activeOrder);
  }

  async function updateActiveStatus(status) {
    if (!activeOrder) return;
    try {
      await api(`/orders/${activeOrder.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (status === "livree") {
        activeOrder = null;
        available = online;
      }
      await refreshActiveOrder();
      renderStatus();
      refreshOffers();
    } catch (err) { alert(err.message); }
  }

  function openNavigation(order) {
    const target = order.status === "acceptee" ? order.pickupLocation : order.dropoffLocation;
    if (!target || !Number.isFinite(Number(target.lat)) || !Number.isFinite(Number(target.lng))) return alert("Position GPS indisponible");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${target.lat},${target.lng}`)}&travelmode=driving`, "_blank", "noopener");
  }

  async function refreshOffers() {
    if (!online || activeOrder || window.__veltoUser?.role !== "taxi") return;
    try {
      const rows = await api("/drivers/me/offers");
      const offers = Array.isArray(rows) ? rows : [];
      const host = document.getElementById("taxi-offers"); if (!host) return;
      const count = document.getElementById("taxi-count"); if (count) count.textContent = String(offers.length);
      if (!offers.length) { host.innerHTML = `<p class="empty-state">Aucune course taxi disponible pour le moment.</p>`; return; }
      host.innerHTML = offers.map(({ order, offer }) => `<article class="order-card"><div class="order-card-head"><span>🚕 Taxi · #${esc(String(order.id || "").slice(-5))}</span><span>${Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime()-Date.now())/1000))}s</span></div><p>📍 ${esc(order.pickup)}</p><p>🏁 ${esc(order.dropoff)}</p><p>💰 ${Number(order.fee || 0).toFixed(2)} ${esc(order.currency || "TND")} · ${Number(offer.distanceToPickupKm || 0).toFixed(1)} km</p><div class="order-actions"><button class="accent" data-accept="${esc(order.id)}">✓ Accepter</button><button data-decline="${esc(order.id)}">Refuser</button></div></article>`).join("");
      host.querySelectorAll("[data-accept]").forEach(b => b.onclick = () => respond(b.dataset.accept, true));
      host.querySelectorAll("[data-decline]").forEach(b => b.onclick = () => respond(b.dataset.decline, false));
    } catch {}
  }

  async function respond(id, accept) {
    try {
      if (accept) {
        await api(`/orders/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "acceptee" }) });
        activeOrder = null;
        available = false;
        await refreshActiveOrder();
      } else {
        await api(`/drivers/me/offers/${id}/decline`, { method: "POST" });
      }
      renderStatus();
      refreshOffers();
    } catch (err) { alert(err.message); }
  }

  window.addEventListener("velto:auth", () => { if (window.__veltoUser?.role === "taxi") { mount(); syncState(); refreshActiveOrder(); } });
  window.__veltoUser = window.__veltoUser || null;
  setTimeout(mount, 300);
  timer = setInterval(() => { refreshActiveOrder(); refreshOffers(); }, 2500);
})();
