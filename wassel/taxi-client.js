(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const esc = v => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const service = () => document.getElementById("category-taxi");
  let currentPickup = null;
  let estimate = null;
  let watchId = null;

  async function geocode(q) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
    const d = await r.json();
    if (!d[0]) throw new Error("Position introuvable");
    return { lat: Number(d[0].lat), lng: Number(d[0].lon) };
  }

  async function estimateFare(pickup, dropoff) {
    const panel = service();
    const box = panel?.querySelector(".taxi-estimate");
    if (!box) return;
    box.textContent = "Calcul du tarif…";
    try {
      const a = pickup || currentPickup;
      const b = dropoff;
      if (!a || !b) return;
      const km = haversine(a, b);
      const fare = Math.max(5, 3 + km * 0.8);
      estimate = { km, fare };
      box.innerHTML = `<b>Estimation</b><span>${km.toFixed(1)} km</span><strong>${fare.toFixed(1)} TND</strong><small>Tarif final calculé par Velto à la création.</small>`;
    } catch { box.textContent = "Impossible de calculer l'estimation"; }
  }

  function haversine(a, b) {
    const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180;
    const la1=a.lat*Math.PI/180, la2=b.lat*Math.PI/180;
    const x=Math.sin(dLat/2)**2+Math.sin(dLng/2)**2*Math.cos(la1)*Math.cos(la2);
    return 2*R*Math.asin(Math.sqrt(x));
  }

  function enhance() {
    const panel = service();
    if (!panel || panel.dataset.taxiEnhanced || !panel.querySelector(".velto-service-form")) return;
    panel.dataset.taxiEnhanced = "1";
    const form = panel.querySelector(".velto-service-form");
    const pickup = form.querySelector('[name="pickup"]');
    const dropoff = form.querySelector('[name="dropoff"]');
    const detail = form.querySelector('[name="detail"]');
    pickup.placeholder = "Ex: Ma position actuelle";
    detail.placeholder = "Ex: 2 passagers · 1 bagage";

    const geo = document.createElement("button");
    geo.type = "button"; geo.className = "btn-ghost"; geo.textContent = "◎ Utiliser ma position";
    pickup.parentNode.appendChild(geo);

    const estimateBox = document.createElement("div");
    estimateBox.className = "taxi-estimate";
    estimateBox.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0;padding:14px 16px;border:1px solid rgba(214,178,94,.28);border-radius:14px;background:rgba(214,178,94,.07);font-size:13px";
    estimateBox.textContent = "Entrez départ et destination pour estimer le tarif.";
    form.querySelector(".service-payment")?.before(estimateBox);

    geo.onclick = () => {
      if (!navigator.geolocation) return alert("GPS non disponible");
      geo.disabled = true; geo.textContent = "Localisation…";
      navigator.geolocation.getCurrentPosition(async pos => {
        currentPickup = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        pickup.value = `Ma position (${currentPickup.lat.toFixed(5)}, ${currentPickup.lng.toFixed(5)})`;
        geo.disabled = false; geo.textContent = "✓ Position actuelle";
        if (dropoff.value.trim()) { try { await estimateFare(currentPickup, await geocode(dropoff.value.trim())); } catch {} }
      }, () => { geo.disabled=false; geo.textContent="◎ Utiliser ma position"; alert("Autorisez le GPS pour utiliser votre position."); }, { enableHighAccuracy:true, timeout:15000, maximumAge:10000 });
    };

    dropoff.addEventListener("blur", async () => {
      if (!dropoff.value.trim()) return;
      try { const b = await geocode(dropoff.value.trim()); const a = currentPickup || await geocode(pickup.value.trim()); currentPickup = a; estimateFare(a,b); } catch {}
    });

    form.addEventListener("submit", async () => {
      if (currentPickup && pickup.value.startsWith("Ma position (")) {
        const nativeFetch = window.fetch;
        const original = nativeFetch;
        window.fetch = function(url, options) {
          if (String(url).endsWith("/orders") && options?.body) {
            try {
              const body = JSON.parse(options.body);
              if (body.serviceType === "taxi") body.pickupLocation = currentPickup;
              options.body = JSON.stringify(body);
            } catch {}
          }
          return original.apply(this, arguments);
        };
        setTimeout(() => { window.fetch = original; }, 10000);
      }
    }, true);
  }

  setInterval(enhance, 500);
  enhance();
})();
