(() => {
  "use strict";

  const STYLE_ID = "velto-service-ux-v1";
  const COORDINATE_RE = /^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/;

  function coordinatesToAddress(position) {
    return `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
  }

  function addGpsButton(input, label = "Ma position") {
    if (!input || input.dataset.gpsEnhanced === "1") return;
    input.dataset.gpsEnhanced = "1";
    const wrapper = document.createElement("div");
    wrapper.className = "velto-address-tools";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost velto-gps-btn";
    button.textContent = `◎ ${label}`;
    wrapper.appendChild(button);
    button.addEventListener("click", () => {
      if (!navigator.geolocation) {
        window.alert("La géolocalisation n'est pas disponible sur cet appareil.");
        return;
      }
      button.disabled = true;
      button.textContent = "Localisation…";
      navigator.geolocation.getCurrentPosition(
        position => {
          input.value = coordinatesToAddress(position);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          button.textContent = "✓ Position ajoutée";
          setTimeout(() => { button.textContent = `◎ ${label}`; button.disabled = false; }, 1600);
        },
        error => {
          button.disabled = false;
          button.textContent = `◎ ${label}`;
          const message = error.code === 1 ? "Autorisez la localisation pour utiliser cette fonction." : "Position indisponible. Vérifiez votre GPS.";
          window.alert(message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    });
  }

  function addSwapButton(form) {
    if (!form || form.dataset.swapEnhanced === "1") return;
    const pickup = form.elements?.pickup;
    const dropoff = form.elements?.dropoff;
    if (!pickup || !dropoff) return;
    form.dataset.swapEnhanced = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost velto-swap-btn";
    button.textContent = "↕ Inverser départ / destination";
    const target = dropoff.closest("label") || dropoff.parentElement;
    target?.after(button);
    button.addEventListener("click", () => {
      const value = pickup.value;
      pickup.value = dropoff.value;
      dropoff.value = value;
      pickup.dispatchEvent(new Event("input", { bubbles: true }));
      dropoff.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function enhance() {
    document.querySelectorAll("#category-food input[name='pickup'], #category-shop input[name='pickup'], #category-market input[name='pickup'], #category-taxi input[name='pickup']").forEach(input => addGpsButton(input));
    document.querySelectorAll("#category-food form.catalog-checkout, #category-shop form.catalog-checkout, #category-market form.catalog-checkout, #category-taxi form.taxi-service-form").forEach(addSwapButton);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .velto-address-tools{display:flex;gap:8px;align-items:center}
      .velto-address-tools input{flex:1;min-width:0}
      .velto-gps-btn,.velto-swap-btn{margin-top:7px}
      .velto-gps-btn{white-space:nowrap}
      @media(max-width:560px){.velto-address-tools{display:grid}.velto-gps-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  enhance();
  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("velto:auth", enhance);
})();
