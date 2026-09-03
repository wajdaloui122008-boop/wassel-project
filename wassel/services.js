(() => {
  "use strict";

  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const authHeaders = () => token() ? { Authorization: `Bearer ${token()}` } : {};

  const menus = {
    food: [
      ["pizza-margherita", "Pizza Margherita", 12, "Tomate, mozzarella, basilic"],
      ["pizza-4-fromages", "Pizza 4 Fromages", 17, "Mozzarella, emmental, bleu, parmesan"],
      ["burger-classic", "Classic Burger", 14, "Bœuf, cheddar, salade, sauce maison"],
      ["chicken-wrap", "Chicken Wrap", 11, "Poulet grillé, crudités, sauce"],
      ["fries", "Frites", 5, "Frites croustillantes"],
      ["soft-drink", "Boisson", 3, "Canette 33 cl"]
    ].map(([id, name, price, desc]) => ({ id, name, price, desc })),
    shop: [
      ["shop-tshirt", "T-shirt", 25, "T-shirt unisexe"],
      ["shop-jeans", "Jean", 65, "Jean classique"],
      ["shop-sneakers", "Baskets", 90, "Baskets casual"],
      ["shop-backpack", "Sac à dos", 45, "Sac à dos quotidien"],
      ["shop-headphones", "Casque audio", 75, "Casque sans fil"],
      ["shop-charger", "Chargeur USB-C", 18, "Chargeur secteur USB-C"]
    ].map(([id, name, price, desc]) => ({ id, name, price, desc })),
    market: [
      ["market-milk", "Lait", 2.2, "1 L"],
      ["market-bread", "Pain complet", 1.5, "Pièce"],
      ["market-eggs", "Œufs", 4.8, "Boîte de 12"],
      ["market-apples", "Pommes", 4.5, "1 kg"],
      ["market-potatoes", "Pommes de terre", 2.8, "1 kg"],
      ["market-water", "Eau", 3.6, "Pack 6 × 1,5 L"],
      ["market-rice", "Riz", 4.2, "1 kg"],
      ["market-tomatoes", "Tomates", 3.9, "1 kg"]
    ].map(([id, name, price, desc]) => ({ id, name, price, desc }))
  };

  const meta = {
    food: { icon: "🍔", title: "Commander à manger", subtitle: "Choisissez vos plats puis faites-vous livrer.", pickup: "Restaurant", pickupPlaceholder: "Ex: Le Comptoir, Tunis" },
    shop: { icon: "🛍️", title: "Shop", subtitle: "Choisissez vos produits et faites-les livrer.", pickup: "Magasin", pickupPlaceholder: "Ex: Shop Velto, Tunis" },
    market: { icon: "🛒", title: "Market", subtitle: "Faites vos courses et recevez-les à domicile.", pickup: "Magasin", pickupPlaceholder: "Ex: Marché, Tunis" }
  };

  function notify(message, good = false) {
    let el = document.getElementById("velto-service-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "velto-service-toast";
      el.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:100000;padding:14px 18px;border-radius:14px;background:#211d18;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.2);font:600 13px Inter,Arial";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.border = good ? "1px solid #d6b25e" : "1px solid rgba(255,255,255,.15)";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 3500);
  }

  async function readJson(response) {
    try { return await response.json(); } catch { return {}; }
  }

  function parseCoordinates(value) {
    const match = String(value || "").match(/^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
  }

  async function geocode(value) {
    const coords = parseCoordinates(value);
    if (coords) return coords;
    const query = String(value || "").trim();
    if (!query) throw new Error("Adresse obligatoire.");
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Service de localisation indisponible.");
    const data = await response.json();
    if (!data[0]) throw new Error(`Adresse introuvable : ${query}`);
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  }

  function paymentButtons(selected) {
    return `<div class="payment-toggle service-payment">
      <button type="button" class="payment-option ${selected === "especes" ? "active" : ""}" data-payment="especes">💵 Espèces</button>
      <button type="button" class="payment-option ${selected === "carte" ? "active" : ""}" data-payment="carte">💳 Carte</button>
      <button type="button" class="payment-option ${selected === "wallet" ? "active" : ""}" data-payment="wallet">👛 Wallet</button>
    </div>`;
  }

  function productButton(item, icon) {
    return `<button type="button" class="order-card service-product" data-product="${item.id}" style="text-align:left;display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%">
      <span style="display:flex;gap:10px;align-items:center"><span style="font-size:25px">${icon}</span><span><b>${item.name}</b><small style="display:block;opacity:.7">${item.desc}</small></span></span>
      <strong>${item.price.toFixed(2)} TND</strong>
    </button>`;
  }

  function mountCatalog(category, panel) {
    if (!panel || panel.dataset.serviceReady === "1") return;
    panel.dataset.serviceReady = "1";
    const info = meta[category];
    const menu = menus[category];
    const icon = category === "food" ? "🍔" : category === "shop" ? "🛍️" : "🛒";
    const cart = new Map();
    let payment = "especes";

    panel.innerHTML = `<div class="two-col">
      <div class="glass-panel form-panel">
        <div style="font-size:38px">${info.icon}</div>
        <h1>${info.title}</h1>
        <p class="subtitle">${info.subtitle}</p>
        <div style="display:grid;gap:10px;margin:16px 0">${menu.map(item => productButton(item, icon)).join("")}</div>
      </div>
      <div class="glass-panel"><h2>Votre panier</h2><div class="service-cart"><p class="empty-state">Votre panier est vide.</p></div></div>
    </div>`;

    const render = () => {
      const cartEl = panel.querySelector(".service-cart");
      const rows = [...cart.values()];
      if (!rows.length) {
        cartEl.innerHTML = `<p class="empty-state">Votre panier est vide.</p>`;
        return;
      }
      const total = rows.reduce((sum, row) => sum + row.item.price * row.qty, 0);
      cartEl.innerHTML = rows.map(row => `<div class="order-card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <div style="flex:1"><b>${row.item.name}</b><span> × ${row.qty}</span><small style="display:block;opacity:.7">${(row.item.price * row.qty).toFixed(2)} TND</small></div>
        <button type="button" data-minus="${row.item.id}">−</button><button type="button" data-plus="${row.item.id}">+</button>
      </div>`).join("") + `<div style="display:flex;justify-content:space-between;margin-top:14px"><b>Total produits</b><b>${total.toFixed(2)} TND</b></div>
      <form class="catalog-checkout" style="margin-top:16px">
        <label>${info.pickup}<input name="pickup" required maxlength="250" placeholder="${info.pickupPlaceholder}"></label>
        <label>Adresse de livraison<input name="dropoff" required maxlength="250" placeholder="Ex: Lac 2, Tunis"></label>
        ${paymentButtons(payment)}
        <button class="btn-primary" type="submit">Commander · ${total.toFixed(2)} TND</button>
        <p class="form-error service-error"></p>
      </form>`;

      cartEl.querySelectorAll("[data-minus]").forEach(button => button.onclick = () => {
        const row = cart.get(button.dataset.minus);
        if (!row) return;
        if (row.qty > 1) row.qty -= 1; else cart.delete(button.dataset.minus);
        render();
      });
      cartEl.querySelectorAll("[data-plus]").forEach(button => button.onclick = () => {
        const row = cart.get(button.dataset.plus);
        if (row) row.qty += 1;
        render();
      });
      cartEl.querySelectorAll("[data-payment]").forEach(button => button.onclick = () => {
        payment = button.dataset.payment;
        cartEl.querySelectorAll("[data-payment]").forEach(b => b.classList.toggle("active", b === button));
      });
      cartEl.querySelector(".catalog-checkout").onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = form.querySelector(".service-error");
        const submit = form.querySelector("button[type=submit]");
        const data = new FormData(form);
        try {
          error.textContent = "";
          submit.disabled = true;
          submit.textContent = "Préparation…";
          const pickup = String(data.get("pickup") || "").trim();
          const dropoff = String(data.get("dropoff") || "").trim();
          const [pickupLocation, dropoffLocation] = await Promise.all([geocode(pickup), geocode(dropoff)]);
          const detail = rows.map(row => `${row.qty}× ${row.item.name}`).join(", ");
          const response = await fetch(`${API}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ serviceType: category, pickup, dropoff, pkg: `[${category.toUpperCase()}] ${detail}`, paymentMethod: payment, pickupLocation, dropoffLocation })
          });
          const result = await readJson(response);
          if (!response.ok) throw new Error(result.error || "Impossible d'envoyer la commande.");
          notify(`Commande ${category} envoyée avec succès`, true);
          cart.clear();
          render();
          window.__veltoRefreshOrders?.();
        } catch (err) {
          error.textContent = err.message || "Erreur inattendue.";
          notify(error.textContent);
        } finally {
          submit.disabled = false;
          submit.textContent = `Commander · ${total.toFixed(2)} TND`;
        }
      };
    };

    panel.querySelectorAll(".service-product").forEach(button => button.onclick = () => {
      const item = menu.find(entry => entry.id === button.dataset.product);
      if (!item) return;
      const row = cart.get(item.id) || { item, qty: 0 };
      row.qty += 1;
      cart.set(item.id, row);
      render();
    });
  }

  function mountTaxi(panel) {
    if (!panel || panel.dataset.serviceReady === "1") return;
    panel.dataset.serviceReady = "1";
    let payment = "especes";
    panel.innerHTML = `<div class="two-col">
      <div class="glass-panel form-panel">
        <div style="font-size:38px">🚕</div><h1>Réserver un Taxi</h1>
        <p class="subtitle">Demandez un chauffeur depuis votre position vers votre destination.</p>
        <form class="taxi-service-form">
          <label>Point de départ<input name="pickup" required maxlength="250" placeholder="Ex: Avenue Habib Bourguiba, Tunis"></label>
          <button type="button" class="btn-ghost" data-use-gps>◎ Utiliser ma position</button>
          <label>Destination<input name="dropoff" required maxlength="250" placeholder="Ex: Lac 2, Tunis"></label>
          <label>Détails<input name="detail" maxlength="250" placeholder="Ex: 2 passagers · bagages optionnels"></label>
          ${paymentButtons(payment)}
          <button class="btn-primary" type="submit">Demander un taxi</button>
          <p class="form-error service-error"></p>
        </form>
      </div>
      <div class="glass-panel"><h2>Comment ça marche ?</h2><p>1. Indiquez le départ et la destination.</p><p>2. Velto cherche un chauffeur disponible.</p><p>3. Suivez la course depuis votre tableau de bord.</p></div>
    </div>`;

    const form = panel.querySelector(".taxi-service-form");
    form.querySelector("[data-use-gps]").onclick = () => navigator.geolocation?.getCurrentPosition(position => {
      form.elements.pickup.value = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
      notify("Position GPS ajoutée", true);
    }, () => notify("Impossible d'obtenir votre position."));
    form.querySelectorAll("[data-payment]").forEach(button => button.onclick = () => {
      payment = button.dataset.payment;
      form.querySelectorAll("[data-payment]").forEach(b => b.classList.toggle("active", b === button));
    });
    form.onsubmit = async event => {
      event.preventDefault();
      const error = form.querySelector(".service-error");
      const submit = form.querySelector("button[type=submit]");
      const data = new FormData(form);
      try {
        error.textContent = "";
        submit.disabled = true;
        submit.textContent = "Recherche d'un chauffeur…";
        const pickup = String(data.get("pickup") || "").trim();
        const dropoff = String(data.get("dropoff") || "").trim();
        const detail = String(data.get("detail") || "").trim() || "Taxi";
        const [pickupLocation, dropoffLocation] = await Promise.all([geocode(pickup), geocode(dropoff)]);
        const response = await fetch(`${API}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ serviceType: "taxi", pickup, dropoff, pkg: `[TAXI] ${detail}`, paymentMethod: payment, pickupLocation, dropoffLocation })
        });
        const result = await readJson(response);
        if (!response.ok) throw new Error(result.error || "Impossible de demander le taxi.");
        notify("Demande de taxi envoyée", true);
        form.reset();
        form.querySelector('[data-payment="especes"]').classList.add("active");
        payment = "especes";
        window.__veltoRefreshOrders?.();
      } catch (err) {
        error.textContent = err.message || "Erreur inattendue.";
        notify(error.textContent);
      } finally {
        submit.disabled = false;
        submit.textContent = "Demander un taxi";
      }
    };
  }
      }
    };
  }

  function mountAll() {
    const mounts = [
      ["food", document.getElementById("category-food")],
      ["taxi", document.getElementById("category-taxi")],
      ["shop", document.getElementById("category-shop")],
      ["market", document.getElementById("category-market")]
    ];
    mounts.forEach(([category, panel]) => {
      if (category === "taxi") mountTaxi(panel);
      else mountCatalog(category, panel);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll, { once: true });
  else mountAll();
})();
