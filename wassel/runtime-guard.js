(() => {
  const API_URL = "https://wassel-backend-ds3n.onrender.com";
  let banner;

  function ensureBanner() {
    if (banner?.isConnected) return banner;
    banner = document.createElement("div");
    banner.className = "velto-runtime-banner hidden";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = '<span class="velto-runtime-dot"></span><span class="velto-runtime-text"></span>';
    document.body.appendChild(banner);
    return banner;
  }

  function show(message, kind = "info") {
    const el = ensureBanner();
    el.classList.remove("hidden", "is-error", "is-ok");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "ok") el.classList.add("is-ok");
    el.querySelector(".velto-runtime-text").textContent = message;
  }

  function hide() {
    if (banner) banner.classList.add("hidden");
  }

  async function checkApi() {
    try {
      const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
      if (response.ok) {
        hide();
        return true;
      }
    } catch {}
    show("Connexion au serveur momentanément indisponible. Vos données locales restent intactes.", "error");
    return false;
  }

  window.addEventListener("offline", () => show("Vous êtes hors connexion. Velto reprendra automatiquement dès que le réseau revient."));
  window.addEventListener("online", () => { show("Connexion rétablie.", "ok"); setTimeout(checkApi, 700); setTimeout(hide, 2500); });
  window.addEventListener("error", (event) => {
    if (event?.error) console.error("Velto runtime error:", event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Velto unhandled rejection:", event.reason);
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!navigator.onLine) show("Vous êtes hors connexion. Velto reprendra automatiquement dès que le réseau revient.");
    else setTimeout(checkApi, 1200);
  });
})();
