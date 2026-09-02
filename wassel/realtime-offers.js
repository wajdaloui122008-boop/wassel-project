(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const typeInfo = { colis:["📦","Colis"], food:["🍔","Food"], taxi:["🚗","Taxi"], shop:["🛍️","Shop"], market:["🛒","Market"] };
  const $ = (s) => document.querySelector(s);

  function toast(message) {
    const host = $("#d2toast");
    if (host) { host.textContent = message; host._t && clearTimeout(host._t); host._t = setTimeout(() => host.remove(), 3200); return; }
    const x = document.createElement("div"); x.id = "velto-realtime-offer-toast";
    x.textContent = message; x.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:100001;background:#211d18;color:#fff;padding:13px 17px;border-radius:13px;font:700 13px Inter,Arial;box-shadow:0 12px 35px rgba(0,0,0,.2)";
    document.body.appendChild(x); setTimeout(() => x.remove(), 3200);
  }

  async function handle(action, id, card) {
    const buttons = card.querySelectorAll("button"); buttons.forEach(b => b.disabled = true);
    const options = action === "accept"
      ? { method:"PATCH", headers:{"Content-Type":"application/json",...headers()}, body:JSON.stringify({status:"acceptee"}) }
      : { method:"POST", headers:headers() };
    const url = action === "accept" ? `${API}/orders/${id}/status` : `${API}/drivers/me/offers/${id}/decline`;
    try {
      const res = await fetch(url, options); const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Offre indisponible");
      toast(action === "accept" ? "✓ Course acceptée" : "Offre refusée");
      card.remove();
      if (window.__veltoRefreshDriverOffers) window.__veltoRefreshDriverOffers();
    } catch (err) {
      toast(err.message || "Erreur"); buttons.forEach(b => b.disabled = false);
    }
  }

  function show(payload) {
    const user = window.__veltoUser;
    if (user?.role && user.role !== "livreur") return;
    const host = $("#d2offerList"); if (!host || !payload?.order?.id) return;
    const o = payload.order, of = payload.offer || {}, id = String(o.id), selector = `.d2offer[data-offer-id="${CSS.escape(id)}"]`;
    if (host.querySelector(selector)) return;
    const iconName = typeInfo[o.serviceType] || typeInfo.colis;
    const exp = new Date(of.expiresAt).getTime();
    const card = document.createElement("article"); card.className = "d2offer"; card.dataset.offerId = id;
    card.innerHTML = `<div class="d2offerhead"><div><span class="d2type">${iconName[0]} ${iconName[1]}</span> <b>#${esc(id.slice(-5))}</b></div><span class="d2countdown">--</span></div><div class="d2offerroute"><b>📍 ${esc(o.pickup)}</b><br>↓<br><b>🏁 ${esc(o.dropoff)}</b></div><small>${esc(o.pkg)} · <b>${Number(o.fee || 0).toFixed(2)} ${esc(o.currency || "TND")}</b>${Number.isFinite(Number(of.distanceToPickupKm)) ? ` · 📍 ${Number(of.distanceToPickupKm).toFixed(1)} km` : ""}</small><div class="d2offeractions"><button class="d2btn d2primary">✓ Accepter</button><button class="d2btn">Refuser</button></div>`;
    const bs = card.querySelectorAll("button"); bs[0].onclick = () => handle("accept", id, card); bs[1].onclick = () => handle("decline", id, card);
    host.prepend(card); toast("🔔 Nouvelle course disponible");
    if ("Notification" in window && Notification.permission === "granted") { try { new Notification("Velto — nouvelle course", { body: `${iconName[1]} · ${of.distanceToPickupKm ?? "—"} km du retrait` }); } catch {} }
    const count = $("#d2offerCount"); if (count) count.textContent = String(host.querySelectorAll(".d2offer").length);
    const timer = setInterval(() => { const sec = Math.max(0, Math.ceil((exp - Date.now()) / 1000)); const el = card.querySelector(".d2countdown"); if (el) el.textContent = sec + "s"; if (sec <= 0 || !document.body.contains(card)) { clearInterval(timer); if (document.body.contains(card)) card.remove(); } }, 500);
  }

  window.addEventListener("velto:realtime-offer", e => show(e.detail));
})();
