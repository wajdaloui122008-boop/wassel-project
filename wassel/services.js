(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const json = async r => { try { return await r.json(); } catch { return {}; } };
  const catalogs = {
    food: {
      icon: "🍔",
      title: "Commander à manger",
      subtitle: "Choisissez un restaurant, remplissez votre panier, puis faites-vous livrer.",
      storeLabel: "Restaurant",
      pickupLabel: "Adresse du restaurant",
      submit: "Commander le repas",
      stores: [
        { id: "le-comptoir", name: "Le Comptoir", address: "Le Comptoir, Avenue Habib Bourguiba, Tunis" },
        { id: "pizza-house", name: "Pizza House", address: "Pizza House, Lac 1, Tunis" },
        { id: "burger-lab", name: "Burger Lab", address: "Burger Lab, La Marsa, Tunis" }
      ],
      items: [
        { id: "pizza-margherita", store: "le-comptoir", name: "Pizza Margherita", price: 12, desc: "Tomate, mozzarella, basilic" },
        { id: "pizza-4-fromages", store: "pizza-house", name: "Pizza 4 Fromages", price: 17, desc: "Mozzarella, emmental, bleu, parmesan" },
        { id: "burger-classic", store: "burger-lab", name: "Classic Burger", price: 14, desc: "Bœuf, cheddar, salade, sauce maison" },
        { id: "chicken-wrap", store: "le-comptoir", name: "Chicken Wrap", price: 11, desc: "Poulet grillé, crudités, sauce" },
        { id: "couscous", store: "le-comptoir", name: "Couscous royal", price: 18, desc: "Agneau, merguez, légumes" },
        { id: "fries", store: "burger-lab", name: "Frites", price: 5, desc: "Frites croustillantes" },
        { id: "soft-drink", store: "pizza-house", name: "Boisson", price: 3, desc: "Canette 33 cl" }
      ]
    },
    shop: {
      icon: "🛍️",
      title: "Commander au Shop",
      subtitle: "Choisissez une boutique et les articles à récupérer pour vous.",
      storeLabel: "Boutique",
      pickupLabel: "Adresse de la boutique",
      submit: "Commander au Shop",
      stores: [
        { id: "zara-medina", name: "Zara Médina", address: "Zara, Souk El Attarine, Médina, Tunis" },
        { id: "fnac-tunis", name: "Fnac Tunis City", address: "Fnac, Tunis City, Ariana" },
        { id: "decathlon-lac", name: "Decathlon Lac", address: "Decathlon, Lac 3, Tunis" }
      ],
      items: [
        { id: "tee-noir", store: "zara-medina", name: "T-shirt noir", price: 39, desc: "Coton, taille M/L" },
        { id: "sneakers", store: "zara-medina", name: "Baskets blanches", price: 89, desc: "Taille 42" },
        { id: "casque", store: "fnac-tunis", name: "Casque Bluetooth", price: 129, desc: "Réduction bruit, 30 h d'autonomie" },
        { id: "chargeur", store: "fnac-tunis", name: "Chargeur USB-C", price: 25, desc: "Charge rapide 30W" },
        { id: "ballon", store: "decathlon-lac", name: "Ballon de football", price: 35, desc: "Taille 5, extérieur" },
        { id: "tapis-yoga", store: "decathlon-lac", name: "Tapis de yoga", price: 42, desc: "Antidérapant, 6 mm" }
      ]
    },
    market: {
      icon: "🛒",
      title: "Faire mes courses",
      subtitle: "Cochez votre liste, un livreur passe au magasin et vous livre.",
      storeLabel: "Magasin",
      pickupLabel: "Adresse du magasin",
      submit: "Commander mes courses",
      stores: [
        { id: "carrefour-lac", name: "Carrefour Lac", address: "Carrefour, Les Berges du Lac, Tunis" },
        { id: "monoprix-centre", name: "Monoprix Centre", address: "Monoprix, Avenue de France, Tunis" }
      ],
      items: [
        { id: "lait", store: "carrefour-lac", name: "Lait 1 L", price: 1.6, desc: "Demi-écrémé" },
        { id: "pain", store: "carrefour-lac", name: "Pain de mie", price: 2.4, desc: "Complet, 500 g" },
        { id: "oeufs", store: "carrefour-lac", name: "Œufs x12", price: 4.5, desc: "Plein air" },
        { id: "tomates", store: "monoprix-centre", name: "Tomates 1 kg", price: 2.8, desc: "Fraîches du jour" },
        { id: "poulet", store: "monoprix-centre", name: "Poulet 1 kg", price: 9.5, desc: "Découpé" },
        { id: "eau", store: "carrefour-lac", name: "Pack d'eau 6x1,5 L", price: 3.2, desc: "Safia" },
        { id: "riz", store: "monoprix-centre", name: "Riz 1 kg", price: 3.9, desc: "Long grain" },
        { id: "yaourt", store: "monoprix-centre", name: "Yaourts x8", price: 4.1, desc: "Nature sucré" }
      ]
    }
  };
  const taxiConfig = {
    icon: "🚗",
    title: "Réserver un Taxi",
    sub: "Demandez une course depuis votre position vers votre destination.",
    pickup: "Point de départ",
    detail: "Ex: 2 passagers · bagages optionnels",
    button: "Demander un taxi"
  };

  function parseCoordinates(q) {
    const m = String(q || "").match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }
  async function geocode(q) {
    const coords = parseCoordinates(q);
    if (coords) return coords;
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
    const d = await r.json();
    if (!d[0]) throw new Error(`Adresse introuvable : ${q}`);
    return { lat: Number(d[0].lat), lng: Number(d[0].lon) };
  }
  function toast(message, good = false) {
    let h = document.getElementById("velto-service-toast");
    if (!h) {
      h = document.createElement("div");
      h.id = "velto-service-toast";
      h.style = "position:fixed;right:20px;bottom:20px;z-index:100000;padding:14px 18px;border-radius:14px;background:#211d18;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.2);font:600 13px Inter,Arial";
      document.body.appendChild(h);
    }
    h.textContent = message;
    h.style.border = good ? "1px solid #d6b25e" : "1px solid rgba(255,255,255,.15)";
    clearTimeout(h._t);
    h._t = setTimeout(() => h.remove(), 3500);
  }
  function money(n) { return `${Number(n).toFixed(2)} TND`; }
  function paymentButtons() {
    return `<p class="step-label">Paiement</p><div class="payment-toggle service-payment"><button type="button" class="payment-option active" data-payment="especes">💵 Espèces</button><button type="button" class="payment-option" data-payment="carte">💳 Carte</button><button type="button" class="payment-option" data-payment="wallet">👛 Wallet</button></div>`;
  }
  function bindPayment(root, state) {
    root.querySelectorAll(".payment-option").forEach((b) => {
      b.onclick = () => {
        root.querySelectorAll(".payment-option").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.payment = b.dataset.payment;
      };
    });
  }

  function mountCatalog(category, panel) {
    if (!panel || panel.dataset.serviceReady) return;
    panel.dataset.serviceReady = "1";
    const cfg = catalogs[category];
    const cart = new Map();
    let storeId = cfg.stores[0].id;
    const storeOf = () => cfg.stores.find((s) => s.id === storeId) || cfg.stores[0];
    const visibleItems = () => cfg.items.filter((i) => i.store === storeId);
    const cartRows = () => [...cart.values()].filter((x) => x.item.store === storeId);
    const cartTotal = () => cartRows().reduce((s, x) => s + x.item.price * x.qty, 0);

    function renderMenu() {
      const menu = panel.querySelector("#catalog-menu");
      menu.innerHTML = visibleItems().map((i) => `<button type="button" class="catalog-item" data-item="${i.id}"><span class="catalog-item-copy"><b>${i.name}</b><span>${i.desc}</span></span><strong>${money(i.price)}</strong></button>`).join("");
      menu.querySelectorAll("[data-item]").forEach((b) => {
        b.onclick = () => {
          const item = cfg.items.find((x) => x.id === b.dataset.item);
          const row = cart.get(item.id) || { item, qty: 0 };
          row.qty += 1;
          cart.set(item.id, row);
          renderCart();
        };
      });
    }

    function renderCart() {
      const h = panel.querySelector("#catalog-cart");
      const rows = cartRows();
      const total = cartTotal();
      const store = storeOf();
      if (!rows.length) {
        h.innerHTML = '<p class="empty-state">Votre panier est vide.</p>';
        return;
      }
      h.innerHTML = rows.map((x) => `<div class="order-card catalog-cart-row"><div><b>${x.item.name}</b><span> × ${x.qty}</span></div><strong>${money(x.item.price * x.qty)}</strong><button type="button" class="btn-ghost" data-remove="${x.item.id}">−</button></div>`).join("") +
        `<div class="catalog-total"><b>Articles</b><b>${money(total)}</b></div>` +
        `<form id="catalog-checkout">` +
        `<label>Adresse de livraison<input name="dropoff" required placeholder="Ex: Lac 2, Tunis"><button type="button" class="btn-ghost catalog-gps" id="catalog-gps">◎ Ma position</button></label>` +
        `<label>${cfg.pickupLabel}<input name="pickup" required value="${store.address}"></label>` +
        paymentButtons() +
        `<button class="btn-primary" type="submit">${cfg.submit} · ${money(total)} + livraison</button>` +
        `<p class="form-error service-error"></p></form>`;
      h.querySelectorAll("[data-remove]").forEach((b) => {
        b.onclick = () => {
          const x = cart.get(b.dataset.remove);
          if (!x) return;
          if (x.qty > 1) x.qty -= 1;
          else cart.delete(b.dataset.remove);
          renderCart();
        };
      });
      const pay = { payment: "especes" };
      bindPayment(h, pay);
      h.querySelector("#catalog-gps")?.addEventListener("click", () => {
        if (!navigator.geolocation) return toast("GPS non disponible");
        navigator.geolocation.getCurrentPosition((pos) => {
          const input = h.querySelector('[name="dropoff"]');
          input.value = `Ma position (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`;
        }, () => toast("Autorisez le GPS pour utiliser votre position."));
      });
      h.querySelector("#catalog-checkout").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const err = f.querySelector(".service-error");
        const submit = f.querySelector("button[type=submit]");
        const fd = new FormData(f);
        try {
          submit.disabled = true;
          submit.textContent = "Préparation…";
          const pickup = String(fd.get("pickup")).trim();
          const dropoff = String(fd.get("dropoff")).trim();
          const [a, b] = await Promise.all([geocode(pickup), geocode(dropoff)]);
          const detail = rows.map((x) => `${x.qty}× ${x.item.name}`).join(", ");
          const r = await fetch(`${API}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers() },
            body: JSON.stringify({
              serviceType: category,
              pickup,
              dropoff,
              pkg: `[${category.toUpperCase()}] ${store.name} · ${detail}`,
              paymentMethod: pay.payment,
              pickupLocation: a,
              dropoffLocation: b,
              itemsTotal: total
            })
          });
          const d = await json(r);
          if (!r.ok) throw Error(d.error || "Impossible d'envoyer la commande");
          toast("Commande envoyée avec succès", true);
          rows.forEach((x) => cart.delete(x.item.id));
          renderCart();
          window.__veltoRefreshOrders?.();
        } catch (ex) {
          err.textContent = ex.message;
          toast(ex.message);
        } finally {
          submit.disabled = false;
          submit.textContent = `${cfg.submit} · ${money(cartTotal())} + livraison`;
        }
      };
    }

    panel.innerHTML = `<div class="two-col"><div class="glass-panel form-panel"><div class="catalog-hero">${cfg.icon}</div><h1>${cfg.title}</h1><p class="subtitle">${cfg.subtitle}</p><label>${cfg.storeLabel}<select id="catalog-store">${cfg.stores.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select></label><div id="catalog-menu" class="catalog-menu"></div></div><div class="glass-panel"><h2>Votre panier</h2><div id="catalog-cart"><p class="empty-state">Votre panier est vide.</p></div></div></div>`;
    panel.querySelector("#catalog-store").onchange = (e) => {
      storeId = e.target.value;
      renderMenu();
      renderCart();
    };
    renderMenu();
    renderCart();
  }

  function mountTaxi(panel) {
    if (!panel || panel.dataset.serviceReady) return;
    panel.dataset.serviceReady = "1";
    const c = taxiConfig;
    panel.innerHTML = `<div class="two-col"><div class="glass-panel form-panel"><div class="catalog-hero">${c.icon}</div><h1>${c.title}</h1><p class="subtitle">${c.sub}</p><form class="velto-service-form"><label>${c.pickup}<input name="pickup" required placeholder="Ex: Avenue Habib Bourguiba, Tunis"></label><label>Adresse de destination<input name="dropoff" required placeholder="Ex: Aéroport Tunis-Carthage"></label><label>Détails<input name="detail" required placeholder="${c.detail}"></label>${paymentButtons()}<button type="submit" class="btn-primary">${c.button}</button><p class="form-error service-error"></p></form></div><div class="glass-panel"><h2>Comment ça marche ?</h2><div class="service-steps"><p>1. Indiquez votre départ (GPS possible) et votre destination.</p><p>2. Velto estime le tarif et cherche un chauffeur proche.</p><p>3. Suivez la course en direct jusqu'à l'arrivée.</p></div></div></div>`;
    const form = panel.querySelector("form");
    const error = panel.querySelector(".service-error");
    const pay = { payment: "especes" };
    bindPayment(panel, pay);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const pickup = String(fd.get("pickup")).trim();
      const dropoff = String(fd.get("dropoff")).trim();
      const detail = String(fd.get("detail")).trim();
      const submit = form.querySelector("button[type=submit]");
      try {
        submit.disabled = true;
        submit.textContent = "Recherche des adresses…";
        const [a, b] = await Promise.all([geocode(pickup), geocode(dropoff)]);
        submit.textContent = "Envoi…";
        const r = await fetch(`${API}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers() },
          body: JSON.stringify({ serviceType: "taxi", pickup, dropoff, pkg: `[TAXI] ${detail}`, paymentMethod: pay.payment, pickupLocation: a, dropoffLocation: b })
        });
        const d = await json(r);
        if (!r.ok) throw Error(d.error || "Impossible d'envoyer la commande");
        toast("Course taxi demandée", true);
        form.reset();
        window.__veltoRefreshOrders?.();
      } catch (ex) {
        error.textContent = ex.message;
        toast(ex.message);
      } finally {
        submit.disabled = false;
        submit.textContent = c.button;
      }
    };
  }

  function boot() {
    ["food", "shop", "market"].forEach((x) => mountCatalog(x, document.getElementById(`category-${x}`)));
    mountTaxi(document.getElementById("category-taxi"));
  }
  boot();
  setTimeout(boot, 1000);
})();
