(() => {
  const API = window.VELTO_API_URL;
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const json = async (response) => { try { return await response.json(); } catch { return {}; } };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  let mounted = false;

  function toast(message) {
    let element = document.getElementById("vendor-toast");
    if (!element) { element = document.createElement("div"); element.id = "vendor-toast"; element.style = "position:fixed;right:18px;bottom:18px;z-index:100000;padding:13px 16px;border-radius:14px;background:#211d18;color:#fff;font:600 13px Inter,Arial;box-shadow:0 12px 35px rgba(0,0,0,.2)"; document.body.append(element); }
    element.textContent = message; clearTimeout(element._timer); element._timer = setTimeout(() => element.remove(), 3500);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers(), ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Erreur serveur");
    return data;
  }

  function styles() {
    if (document.getElementById("vendor-style")) return;
    const style = document.createElement("style");
    style.id = "vendor-style";
    style.textContent = `.vendor-wrap{padding:24px}.vendor-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.vendor-stat,.vendor-card{padding:16px;border:1px solid rgba(36,28,16,.1);border-radius:16px;background:rgba(255,255,255,.5)}.vendor-stat small{color:#857a67}.vendor-stat strong{display:block;font-size:24px;margin-top:5px}.vendor-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.vendor-btn{border:1px solid #ddd;background:#fff;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.vendor-btn.primary{background:#211d18;color:#fff}.vendor-list{display:grid;gap:10px}.vendor-row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:13px;border-bottom:1px solid rgba(36,28,16,.1)}.vendor-muted{color:#857a67;font-size:13px}.vendor-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.vendor-form label{display:grid;gap:5px;font-size:12px;font-weight:700}.vendor-form input,.vendor-form select{padding:10px;border:1px solid #ddd;border-radius:9px;font:inherit}.vendor-form .wide{grid-column:1/-1}.vendor-badge{padding:4px 8px;border-radius:99px;background:#f3eee6;font-size:12px;font-weight:700}@media(max-width:800px){.vendor-grid{grid-template-columns:repeat(2,1fr)}.vendor-form{grid-template-columns:1fr}.vendor-form .wide{grid-column:auto}.vendor-row{align-items:flex-start;flex-direction:column}}`;
    document.head.append(style);
  }

  async function renderOrders(root) {
    const status = root.querySelector("[name=vendor-status]").value;
    const search = root.querySelector("[name=vendor-search]").value.trim();
    const params = new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) });
    const orders = await request(`/vendors/orders?${params}`);
    root.querySelector("#vendor-orders").innerHTML = orders.length ? orders.map((order) => `<article class="vendor-card"><div class="vendor-row"><div><b>#${esc(String(order.id || order._id).slice(-8))}</b><div class="vendor-muted">${new Date(order.createdAt).toLocaleString()} · ${esc(order.client?.name || "Client")}</div><div>${esc(order.pickup)} → ${esc(order.dropoff)}</div></div><span class="vendor-badge">${esc(order.vendorStatus || order.status)}</span></div><div class="vendor-actions">${order.vendorStatus === "pending" ? `<button class="vendor-btn primary" data-decision="accepted" data-id="${order.id || order._id}">Accepter</button><button class="vendor-btn" data-decision="rejected" data-id="${order.id || order._id}">Refuser</button>` : ""}${order.vendorStatus === "accepted" && order.status === "nouvelle" && order.livreur ? `<button class="vendor-btn primary" data-ready="${order.id || order._id}">Marquer prête</button>` : ""}${order.vendorRejectReason ? `<span class="vendor-muted">Motif : ${esc(order.vendorRejectReason)}</span>` : ""}</div></article>`).join("") : `<p class="vendor-muted">Aucune commande.</p>`;
  }

  async function renderMenu(root) {
    const items = await request("/vendors/menu");
    root.querySelector("#vendor-menu").innerHTML = items.length ? items.map((item) => `<div class="vendor-row"><label><input type="checkbox" data-menu-check="${item.id || item._id}"> <b>${esc(item.name)}</b></label><span>${Number(item.price).toFixed(2)} · ${item.isAvailable ? "Disponible" : "Rupture"} <button class="vendor-btn" data-toggle="${item.id || item._id}" data-available="${item.isAvailable}">${item.isAvailable ? "Rupture" : "Rendre disponible"}</button><button class="vendor-btn" data-delete="${item.id || item._id}">Supprimer</button></span></div>`).join("") : `<p class="vendor-muted">Ajoutez votre premier article.</p>`;
  }

  async function renderStats(root) {
    const [analytics, reconciliation] = await Promise.all([request("/vendors/analytics"), request("/vendors/reconciliation")]);
    root.querySelector("#vendor-stats").innerHTML = `<div class="vendor-stat"><small>Ventes</small><strong>${Number(analytics.summary.salesTotal || 0).toFixed(2)}</strong></div><div class="vendor-stat"><small>Commandes</small><strong>${analytics.summary.orderCount || 0}</strong></div><div class="vendor-stat"><small>Panier moyen</small><strong>${Number(analytics.summary.averageOrderValue || 0).toFixed(2)}</strong></div><div class="vendor-stat"><small>Cash à réconcilier</small><strong>${Number(reconciliation.pendingCash || 0).toFixed(2)}</strong></div>`;
    root.querySelector("#vendor-top").innerHTML = (analytics.topItems || []).map((item) => `<div class="vendor-row"><span>${esc(item._id)}</span><b>${item.quantity}</b></div>`).join("") || `<p class="vendor-muted">Pas encore de ventes.</p>`;
  }

  async function renderSettings(root) {
    const settings = await request("/vendors/settings");
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    root.querySelector("#vendor-settings").innerHTML = `<label><input type="checkbox" name="temporarilyClosed" ${settings.temporarilyClosed ? "checked" : ""}> Temporairement fermé</label>${days.map((day) => { const value = settings.hours?.[day] || {}; return `<label class="vendor-row"><span><input type="checkbox" data-day="${day}" ${value.enabled !== false ? "checked" : ""}> ${day}</span><span><input type="time" data-open="${day}" value="${value.open || "09:00"}"> – <input type="time" data-close="${day}" value="${value.close || "22:00"}"></span></label>`; }).join("")}<button class="vendor-btn primary" id="vendor-save-settings">Enregistrer les horaires</button>`;
  }

  function mount(user) {
    if (mounted || user?.role !== "vendor") return;
    mounted = true; styles();
    const root = document.getElementById("view-vendor");
    root.innerHTML = `<div class="glass-panel vendor-wrap"><div class="panel-kicker">ESPACE VENDEUR</div><h1>Bonjour ${esc(user.name)}</h1><p class="subtitle">Gérez vos commandes, votre catalogue et vos horaires.</p><div id="vendor-stats" class="vendor-grid"></div><section class="vendor-card"><h2>Commandes entrantes</h2><div class="vendor-actions"><select name="vendor-status"><option value="">Tous les statuts</option><option value="pending">À traiter</option><option value="accepted">Acceptées</option><option value="livree">Livrées</option><option value="annulee">Annulées</option></select><input name="vendor-search" placeholder="ID commande"><button class="vendor-btn" id="vendor-refresh">Filtrer</button></div><div id="vendor-orders" class="vendor-list"></div></section><section class="vendor-card" style="margin-top:16px"><h2>Catalogue</h2><form id="vendor-item-form" class="vendor-form"><input name="name" placeholder="Nom" required><input name="price" type="number" min="0" step="0.01" placeholder="Prix" required><input name="category" placeholder="Catégorie"><select name="serviceType"><option value="food">Food</option><option value="shop">Shop</option><option value="market">Market</option></select><input name="photoUrl" placeholder="URL de la photo"><input name="description" class="wide" placeholder="Description"><button class="vendor-btn primary" type="submit">Ajouter l'article</button></form><div class="vendor-actions"><button class="vendor-btn" id="vendor-bulk-off">Mettre la sélection en rupture</button><button class="vendor-btn" id="vendor-bulk-on">Rendre la sélection disponible</button></div><div id="vendor-menu" class="vendor-list"></div></section><section class="vendor-card" style="margin-top:16px"><h2>Horaires et disponibilité</h2><div id="vendor-settings"></div></section><section class="vendor-card" style="margin-top:16px"><h2>Meilleures ventes</h2><div id="vendor-top"></div></section></div>`;
    root.addEventListener("click", async (event) => {
      const button = event.target.closest("button"); if (!button) return;
      try {
        if (button.id === "vendor-refresh") await renderOrders(root);
        if (button.dataset.decision) { let reason = ""; if (button.dataset.decision === "rejected") reason = window.prompt("Motif : out_of_stock, closing ou too_busy", "out_of_stock") || ""; await request(`/vendors/orders/${button.dataset.id}/decision`, { method: "PATCH", body: JSON.stringify({ decision: button.dataset.decision, reason }) }); await renderOrders(root); toast("Commande mise à jour"); }
        if (button.dataset.ready) { await request(`/vendors/orders/${button.dataset.ready}/ready`, { method: "PATCH", body: "{}" }); await renderOrders(root); toast("Livreur prévenu"); }
        if (button.dataset.toggle) { await request(`/vendors/menu/${button.dataset.toggle}`, { method: "PATCH", body: JSON.stringify({ isAvailable: button.dataset.available !== "true" }) }); await renderMenu(root); }
        if (button.dataset.delete) { await request(`/vendors/menu/${button.dataset.delete}`, { method: "DELETE" }); await renderMenu(root); }
        if (button.id === "vendor-bulk-off" || button.id === "vendor-bulk-on") { const ids = [...root.querySelectorAll("[data-menu-check]:checked")].map((input) => input.dataset.menuCheck); await request("/vendors/menu/bulk-availability", { method: "PATCH", body: JSON.stringify({ ids, isAvailable: button.id === "vendor-bulk-on" }) }); await renderMenu(root); }
        if (button.id === "vendor-save-settings") { const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]; const hours = Object.fromEntries(days.map((day) => [day, { enabled: root.querySelector(`[data-day="${day}"]`).checked, open: root.querySelector(`[data-open="${day}"]`).value, close: root.querySelector(`[data-close="${day}"]`).value }])); await request("/vendors/settings", { method: "PUT", body: JSON.stringify({ temporarilyClosed: root.querySelector("[name=temporarilyClosed]").checked, hours }) }); toast("Horaires enregistrés"); }
      } catch (error) { toast(error.message); }
    });
    root.querySelector("#vendor-item-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await request("/vendors/menu", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); event.currentTarget.reset(); await renderMenu(root); toast("Article ajouté"); } catch (error) { toast(error.message); } });
    root.querySelector("#vendor-refresh").click();
    renderMenu(root); renderStats(root); renderSettings(root);
    window.addEventListener("velto:vendor-order", () => { renderOrders(root); toast("Nouvelle commande reçue"); });
  }

  window.addEventListener("velto:auth", (event) => mount(event.detail?.user));
  window.addEventListener("velto:realtime-vendor-order", (event) => window.dispatchEvent(new CustomEvent("velto:vendor-order", { detail: event.detail })));
})();
