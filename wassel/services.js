(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const json = async r => { try { return await r.json(); } catch { return {}; } };
  const configs = {
    food: { icon:"🍔", title:"Commander à manger", sub:"Restaurant, repas et livraison à domicile.", pickup:"Restaurant / adresse du restaurant", detail:"Ex: 2 pizzas, 1 burger, boissons...", button:"Commander le repas" },
    taxi: { icon:"🚗", title:"Réserver un Taxi", sub:"Demandez une course depuis votre position vers votre destination.", pickup:"Point de départ", detail:"Ex: 2 passagers · bagages optionnels", button:"Demander un taxi" },
    shop: { icon:"🛍️", title:"Commander au Shop", sub:"Faites récupérer un achat dans une boutique.", pickup:"Boutique / adresse", detail:"Ex: chaussures taille 42, couleur noire", button:"Commander au Shop" },
    market: { icon:"🛒", title:"Faire mes courses", sub:"Votre liste de courses livrée à domicile.", pickup:"Marché / magasin", detail:"Ex: lait, pain, œufs, fruits...", button:"Commander mes courses" }
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
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers:{Accept:"application/json"} });
    const d = await r.json(); if (!d[0]) throw new Error(`Adresse introuvable : ${q}`);
    return { lat:Number(d[0].lat), lng:Number(d[0].lon) };
  }
  function toast(message, good=false) { let h=document.getElementById("velto-service-toast"); if(!h){h=document.createElement("div");h.id="velto-service-toast";h.style="position:fixed;right:20px;bottom:20px;z-index:100000;padding:14px 18px;border-radius:14px;background:#211d18;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.2);font:600 13px Inter,Arial";document.body.appendChild(h)} h.textContent=message;h.style.border=good?"1px solid #d6b25e":"1px solid rgba(255,255,255,.15)";clearTimeout(h._t);h._t=setTimeout(()=>h.remove(),3500); }
  function mount(category) {
    const panel=document.getElementById(`category-${category}`),c=configs[category]; if(!panel||panel.dataset.serviceReady)return; panel.dataset.serviceReady="1";
    panel.innerHTML=`<div class="two-col"><div class="glass-panel form-panel"><div style="font-size:38px">${c.icon}</div><h1>${c.title}</h1><p class="subtitle">${c.sub}</p><form class="velto-service-form"><label>${c.pickup}<input name="pickup" required placeholder="Ex: Avenue Habib Bourguiba, Tunis" /></label><label>Adresse de livraison<input name="dropoff" required placeholder="Ex: Lac 2, Tunis" /></label><label>Détails<input name="detail" required placeholder="${c.detail}" /></label><p class="step-label">Paiement</p><div class="payment-toggle service-payment"><button type="button" class="payment-option active" data-payment="especes">💵 Espèces</button><button type="button" class="payment-option" data-payment="carte">💳 Carte</button><button type="button" class="payment-option" data-payment="wallet">👛 Wallet</button></div><button type="submit" class="btn-primary">${c.button}</button><p class="form-error service-error"></p></form></div><div class="glass-panel"><h2>Comment ça marche ?</h2><div class="service-steps"><p>1. Indiquez le point de récupération et votre adresse.</p><p>2. Décrivez ce que vous voulez recevoir.</p><p>3. Velto calcule les frais et transmet la demande à un livreur.</p><p>4. Suivez la commande en direct depuis <b>Mes commandes</b>.</p></div></div></div>`;
    const form=panel.querySelector("form"),error=panel.querySelector(".service-error");let payment="especes";
    panel.querySelectorAll(".payment-option").forEach(b=>b.onclick=()=>{panel.querySelectorAll(".payment-option").forEach(x=>x.classList.remove("active"));b.classList.add("active");payment=b.dataset.payment});
    form.onsubmit=async e=>{e.preventDefault();error.textContent="";const fd=new FormData(form),pickup=String(fd.get("pickup")).trim(),dropoff=String(fd.get("dropoff")).trim(),detail=String(fd.get("detail")).trim(),selectedPayment=payment,submit=form.querySelector("button[type=submit]");submit.disabled=true;submit.textContent="Recherche des adresses…";try{const[a,b]=await Promise.all([geocode(pickup),geocode(dropoff)]);submit.textContent="Envoi…";const r=await fetch(`${API}/orders`,{method:"POST",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({serviceType:category,pickup,dropoff,pkg:`[${category.toUpperCase()}] ${detail}`,paymentMethod:selectedPayment,pickupLocation:a,dropoffLocation:b})}),d=await json(r);if(!r.ok)throw Error(d.error||"Impossible d'envoyer la commande");const createdOrder=d.order||d;if(window.__veltoRealtimeWatchOrder&&createdOrder?.id)window.__veltoRealtimeWatchOrder(createdOrder.id);toast(selectedPayment==="especes"?"Commande envoyée avec succès":"Commande créée · préparation du paiement…",true);form.reset();panel.querySelectorAll(".payment-option").forEach((x,i)=>x.classList.toggle("active",i===0));payment="especes";window.__veltoRefreshOrders?.();if(["carte","wallet"].includes(selectedPayment)&&createdOrder?.id&&window.veltoStartPayment)await window.veltoStartPayment(createdOrder);}catch(err){error.textContent=err.message||"Erreur";toast(error.textContent)}finally{submit.disabled=false;submit.textContent=c.button}};
  }
  function boot(){Object.keys(configs).forEach(mount)} boot();setTimeout(boot,1000);setTimeout(boot,3000);
})();