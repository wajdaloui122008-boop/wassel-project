(() => {
  if (!("serviceWorker" in navigator)) return;

  let deferredPrompt = null;
  let refreshing = false;
  let registration = null;

  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      // Registration is enough for startup; do not block the page on a network update.
      // The browser performs normal update checks according to the service-worker lifecycle.

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("PWA service worker:", err);
    }
  });

  // Check for a newer worker when the user returns to the app, rather than on every startup.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !registration) return;
    registration.update().catch(() => {});
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;

    let button = document.getElementById("velto-install-app");
    if (!button) {
      button = document.createElement("button");
      button.id = "velto-install-app";
      button.className = "btn-ghost";
      button.textContent = "📲 Installer Velto";
      document.querySelector(".topbar")?.appendChild(button);
    }

    button.hidden = false;
    button.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      button.remove();
    };
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    document.getElementById("velto-install-app")?.remove();
  });
})();
