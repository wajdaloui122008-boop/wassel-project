(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(err => console.warn("PWA service worker:", err));
  });
  let deferredPrompt = null;
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
  window.addEventListener("appinstalled", () => document.getElementById("velto-install-app")?.remove());
})();
