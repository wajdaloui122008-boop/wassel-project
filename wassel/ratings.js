(() => {
  const API = window.VELTO_API_URL;
  const token = () => localStorage.getItem("velto_token") || "";
  const H = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  let cache = [];
  let loadInFlight = false;

  async function loadOrders() {
    if (!token() || loadInFlight) return;
    loadInFlight = true;
    try {
      const r = await fetch(`${API}/orders?limit=50`, { headers: H() });
      if (!r.ok) return;
      const data = await r.json();
      cache = Array.isArray(data) ? data : [];
      injectButtons();
    } catch {} finally {
      loadInFlight = false;
    }
  }

  function injectButtons() {
    const delivered = cache.filter(o => o.status === "livree");
    document.querySelectorAll(".order-card[data-order-id]").forEach(card => {
      if (card.querySelector(".velto-rate-btn")) return;
      const orderId = String(card.dataset.orderId || "");
      const order = delivered.find(o => String(o.id || o._id || "") === orderId);
      if (!order) return;
      const actions = card.querySelector(".order-actions");
      if (!actions) return;
      const button = document.createElement("button");
      button.className = "btn-ghost velto-rate-btn";
      button.textContent = "⭐ Noter";
      button.addEventListener("click", () => rate(order, button));
      actions.appendChild(button);
    });
  }

  async function rate(order, button) {
    button.disabled = true;
    try {
      const orderId = String(order.id || order._id || "");
      const existingResponse = await fetch(`${API}/ratings/order/${encodeURIComponent(orderId)}`, { headers: H() });
      const existing = existingResponse.ok ? await existingResponse.json() : [];
      const me = window.__veltoUser?.id || window.__veltoUser?._id || "";
      if (Array.isArray(existing) && existing.some(r => String(r.rater?.id || r.rater?._id || r.rater || "") === String(me))) {
        button.textContent = "✓ Déjà noté";
        return;
      }
      const raw = window.prompt("Notez votre livreur de 1 à 5 ⭐", "5");
      if (raw === null) return;
      const score = Number.parseInt(raw, 10);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error("Choisissez une note entre 1 et 5.");
      const vendorRaw = order.vendor ? window.prompt("Notez aussi le vendeur de 1 à 5 ⭐ (optionnel)", "5") : null;
      const vendorRating = vendorRaw === null || vendorRaw === "" ? null : Number.parseInt(vendorRaw, 10);
      if (vendorRating !== null && (!Number.isInteger(vendorRating) || vendorRating < 1 || vendorRating > 5)) throw new Error("La note vendeur doit être comprise entre 1 et 5.");
      const comment = window.prompt("Commentaire (optionnel) :", "") ?? "";
      const r = await fetch(`${API}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...H() },
        body: JSON.stringify({ orderId, rating: score, driverRating: score, vendorRating, comment })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Impossible d'enregistrer la note");
      button.textContent = "✓ Noté";
      button.classList.add("accent");
    } catch (err) {
      alert(err.message || "Erreur");
    } finally {
      if (button.isConnected && button.textContent === "⭐ Noter") button.disabled = false;
    }
  }

  window.addEventListener("velto:auth", loadOrders);
  window.addEventListener("velto:orders-rendered", injectButtons);
  document.addEventListener("DOMContentLoaded", () => { loadOrders(); setInterval(loadOrders, 5000); });
})();
