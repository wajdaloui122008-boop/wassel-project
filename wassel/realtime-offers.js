(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const typeInfo = { colis:["📦","Colis"], food:["🍔","Food"], taxi:["🚕","Taxi"], shop:["🛍️","Shop"], market:["🛒","Market"] };
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
    const options = action === "accept" ? { method:"PATCH", headers:{"Content-Type":"application/json",...headers()}, body:JSON.stringify({status:"acceptee"}) } : { method:"POST", headers:headers() };
    const url = action === "accept" ? `${API}/orders/${id}/status` : `${API}/drivers/me/offers/${id}/decline`;
    try {
      const res = await fetch(url, options); const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Offre indisponible");
      toast(action === "accept" ? "✓ Course acceptée" : "Offre refusée"); card.remove(); window.__veltoRefreshDriverOffers?.();
    } catch (err) { toast(err.message || "Erreur"); buttons.forEach(b => b.disabled = false); }
  }

  function show(payload) {
    const user = window.__veltoUser;
    if (user?.role && user.role !== "taxi") return;
    // The livreur dashboard already owns #d2offerList and refreshes it by polling.
    // Realtime cards therefore target only the taxi dashboard to avoid duplicate/vanishing offers.
    const host = $("#taxi-offers");
    if (!host || !payload?.order) return;
    const o = payload.order, of = payload.offer || {}, id = String(o.id || payload.orderId || "");
    if (!id || host.querySelector(`[data-offer-id="${CSS.escape(id)}"]`)) return;
    const info = typeInfo[o.serviceType] || typeInfo.taxi;
    const exp = new Date(of.expiresAt || payload.expiresAt).getTime();
    const card = document.createElement("article"); card.className = "order-card"; card.dataset.offerId = id;
    card.innerHTML = `<div class="order-card-head"><span>${info[0]} ${info[1]} · #${esc(id.slice(-5))}</span><span class="d2countdown">--</span></div><p>📍 ${esc(o.pickup || payload.pickup)}</p><p>🏁 ${esc(o.dropoff || payload.dropoff)}</p><p>💰 ${Number(o.fee || 0).toFixed(2)} ${esc(o.currency || "TND")} · 📍 ${Number(of.distanceToPickupKm ?? payload.distanceToPickupKm ?? 0).toFixed(1)} km</p><div class="order-actions"><button class="accent">✓ Accepter</button><button>Refuser</button></div>`;
    const bs = card.querySelectorAll("button"); bs[0].onclick = () => handle("accept", id, card); bs[1].onclick = () => handle("decline", id, card);
    host.prepend(card); toast("🔔 Nouvelle course disponible");
    const timer = setInterval(() => { const sec = Math.max(0, Math.ceil((exp-Date.now())/1000)); const el=card.querySelector(".d2countdown"); if(el) el.textContent=sec+"s"; if(sec<=0||!document.body.contains(card)) { clearInterval(timer); if(document.body.contains(card)) card.remove(); } },500);
  }
  window.addEventListener("velto:auth", e => { window.__veltoUser = e.detail?.user || window.__veltoUser; });
  window.addEventListener("velto:realtime-offer", e => show(e.detail));
})();
