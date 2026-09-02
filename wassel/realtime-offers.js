(() => {
  // The taxi dashboard owns taxi-offer rendering. Realtime only asks it to refresh.
  function isTaxiUser() {
    if (window.__veltoUser?.role === "taxi") return true;
    try {
      const raw = localStorage.getItem("velto_token") || "";
      const part = raw.split(".")[1];
      if (!part) return false;
      const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return payload?.role === "taxi";
    } catch { return false; }
  }

  window.addEventListener("velto:realtime-offer", () => {
    if (isTaxiUser()) window.dispatchEvent(new CustomEvent("velto:refresh-taxi-offers"));
  });
})();
