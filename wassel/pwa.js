(() => {
  if (!("serviceWorker" in navigator)) return;

  let deferredPrompt = null;
  let refreshing = false;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await registration.update();

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("PWA service worker:", err);
    }
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
