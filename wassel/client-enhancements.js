(() => {
  const API_URL = window.VELTO_API_URL;
  const money = (value, currency) => window.VELTO_MONEY ? window.VELTO_MONEY(value, currency || "USD") : `${Number(value || 0).toFixed(2)} ${currency || "USD"}`;
  const token = () => localStorage.getItem("velto_token");
  const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const labels = { nouvelle: "Nouvelle", acceptee: "Acceptée", route: "En route", livree: "Livrée", annulee: "Annulée" };
  const serviceLabels = { colis: "📦 Colis", food: "🍔 Food", taxi: "🚗 Taxi", shop: "🛍️ Shop", market: "🛒 Market" };
  const paymentLabels = { especes: "Espèces", carte: "Carte", wallet: "Wallet" };
  let refreshInFlight = false;
  let lastSignature = "";

  async function api(path, options = {}) {
    const t = token();
    if (!t) return null;
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}), Authorization: `Bearer ${t}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || "Erreur serveur");
    return data;
  }

  function inferType(order) {
    if (order.serviceType && serviceLabels[order.serviceType]) return order.serviceType;
    const match = String(order.pkg || "").match(/^\[(COLIS|FOOD|TAXI|SHOP|MARKET)\]/i);
    return match ? match[1].toLowerCase() : "colis";
  }

  function statusProgress(status) {
    return { nouvelle: 0, acceptee: 15, route: 55, livree: 100, annulee: 100 }[status] ?? 0;
  }
  function paymentState(order) {
    if (order.paymentMethod === "especes") return "Paiement à la livraison";
    if (order.paymentStatus === "paid") return "Paiement confirmé";
    if (order.paymentStatus === "failed") return "Paiement échoué";
    return "Paiement en attente";
  }

  function renderOrder(order) {
    const type = inferType(order);
    const orderId = String(order.id || order._id || "");
    const payment = paymentLabels[order.paymentMethod] || order.paymentMethod || "Espèces";
    const canCancel = order.status === "nouvelle" || order.status === "acceptee";
    const date = order.createdAt ? new Date(order.createdAt).toLocaleString(window.VELTO_LOCALE || navigator.language, { dateStyle: "short", timeStyle: "short" }) : "";
    const card = document.createElement("article");
    card.className = "order-card";
    card.dataset.orderId = orderId;
    card.innerHTML = `
      <div class="order-card-head">
        <span class="order-id">#${esc(orderId.slice(-6).toUpperCase())}</span>
        <span class="order-status">${esc(labels[order.status] || order.status)} · ${esc(paymentState(order))}</span>
      </div>
      <div class="route">
        <div class="route-point pickup"><span class="dot"></span><span class="route-label">${esc(order.pickup)}</span></div>
        <div class="route-track"><div class="route-progress" style="width:${statusProgress(order.status)}%"></div><span class="route-marker">🛵</span></div>
        <div class="route-point dropoff"><span class="dot"></span><span class="route-label">${esc(order.dropoff)}</span></div>
      </div>
      <p class="package-desc">${esc(serviceLabels[type])} · ${esc(String(order.pkg || "").replace(/^\[(COLIS|FOOD|TAXI|SHOP|MARKET)\]\s*/i, ""))}</p>
      <p class="fee-line">${esc(money(order.fee, order.currency))}${Number(order.itemsTotal) > 0 ? ` dont ${esc(money(order.itemsTotal, order.currency))} d'articles` : ""} · ${esc(payment)}${date ? ` · ${esc(date)}` : ""}</p>
      ${order.paymentMethod !== "especes" && order.paymentStatus !== "paid" ? `<p class="fee-line" style="color:#b42318;font-weight:700">Paiement ${esc(order.paymentStatus === "failed" ? "échoué" : "en attente")} · finalisez le paiement pour lancer la livraison.</p>` : ""}
      ${order.status === "annulee" && order.cancellationReason ? `<p class="fee-line">Motif: ${esc(order.cancellationReason)}</p>` : ""}
      <div class="order-actions">${order.paymentMethod !== "especes" && order.paymentStatus !== "paid" && order.status !== "annulee" ? `<button class="btn-primary js-client-pay" data-id="${esc(orderId)}">Payer maintenant</button>` : ""}${canCancel ? `<button class="btn-ghost js-client-cancel" data-id="${esc(orderId)}">Annuler</button>` : ""}</div>
    `;
    const btn = card.querySelector(".js-client-cancel");
    const pay = card.querySelector(".js-client-pay");
    if (pay) pay.addEventListener("click", () => {
      const startPayment = window.veltoStartPayment;
      if (typeof startPayment !== "function") {
        alert("Le module de paiement est indisponible. Rechargez la page puis réessayez.");
        return;
      }
      pay.disabled = true;
      Promise.resolve(startPayment(order)).finally(() => { pay.disabled = false; });
    });
    if (btn) btn.addEventListener("click", async () => {
      const reason = window.prompt("Motif d'annulation (optionnel) :", "");
      if (reason === null) return;
      btn.disabled = true;
      try {
        await api(`/orders/${encodeURIComponent(btn.dataset.id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
        await refresh();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
    return card;
  }

  async function refresh() {
    const container = document.getElementById("client-orders");
    if (!container || !token() || refreshInFlight) return;
    refreshInFlight = true;
    try {
      const orders = await api("/orders?limit=50");
      if (!Array.isArray(orders)) return;
      const signature = orders.map((order) => `${order.id || order._id}:${order.status}:${order.updatedAt || ""}`).join("|");
      if (signature === lastSignature) return;
      lastSignature = signature;
      container.innerHTML = "";
      if (!orders.length) {
        container.innerHTML = '<p class="empty-state">Aucune commande pour l\'instant.</p>';
        return;
      }
      orders.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).forEach((order) => container.appendChild(renderOrder(order)));
      window.dispatchEvent(new CustomEvent("velto:orders-rendered", { detail: { count: orders.length } }));
    } catch (err) {
      console.warn("Velto client history:", err.message);
    } finally {
      refreshInFlight = false;
    }
  }

  window.__veltoRefreshOrders = refresh;
  window.addEventListener("velto:auth", refresh);
  document.addEventListener("DOMContentLoaded", () => {
    refresh();
    setInterval(refresh, 5000);
  });
})();
