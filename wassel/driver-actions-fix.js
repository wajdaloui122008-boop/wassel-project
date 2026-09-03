(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const json = async r => { try { return await r.json(); } catch { return {}; } };
  const toast = message => {
    let el = document.querySelector("#d2toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "d2toast";
      el.style = "position:fixed;right:20px;bottom:20px;z-index:100000;background:#211d18;color:#fff;padding:13px 17px;border-radius:13px;font:600 13px Inter,Arial;box-shadow:0 12px 35px rgba(0,0,0,.2)";
      document.body.append(el);
    }
    el.textContent = message;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.remove(), 3200);
  };

  async function refreshDashboard() {
    if (typeof window.loadDriver === "function") {
      try { await window.loadDriver("all"); } catch {}
    }
    document.dispatchEvent(new CustomEvent("velto:driver-refresh"));
  }

  // dashboard2.js calls these actions from its delegated click handlers.
  window.change = async (orderId, status) => {
    const id = String(orderId || "").trim();
    if (!id || !["acceptee", "route", "livree"].includes(status)) return;
    const r = await fetch(`${API}/orders/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify({ status })
    }).catch(() => null);
    const data = r ? await json(r) : {};
    if (!r?.ok) {
      toast(data.error || "Impossible de mettre à jour la course.");
      await refreshDashboard();
      return;
    }
    toast(status === "acceptee" ? "✓ Course acceptée" : status === "route" ? "🛵 Vous êtes en route" : "✓ Livraison terminée");
    await refreshDashboard();
  };

  window.cancel = async orderId => {
    const id = String(orderId || "").trim();
    if (!id) return;
    if (!window.confirm("Annuler cette course ?")) return;
    const r = await fetch(`${API}/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify({ reason: "Annulée par le livreur" })
    }).catch(() => null);
    const data = r ? await json(r) : {};
    if (!r?.ok) {
      toast(data.error || "Impossible d'annuler la course.");
      return;
    }
    toast("Course annulée");
    await refreshDashboard();
  };

  // A realtime offer should appear in the livreur dashboard immediately.
  window.addEventListener("velto:realtime-offer", () => {
    const raw = localStorage.getItem("velto_token") || "";
    if (!raw) return;
    try {
      const payload = JSON.parse(atob(raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload?.role !== "livreur") return;
    } catch { return; }
    document.dispatchEvent(new CustomEvent("velto:driver-offer-received"));
    toast("🔔 Nouvelle course disponible");
  });
})();
