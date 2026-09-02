(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  let socket = null;
  let token = localStorage.getItem("velto_token") || null;
  let watched = new Set();
  let refreshTimer = null;

  function loadSocketIO() {
    if (window.io) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.socket.io/4.8.1/socket.io.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function getActiveOrders() {
    if (!token) return [];
    try {
      const res = await fetch(`${API}/orders`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const orders = await res.json();
      return Array.isArray(orders) ? orders.filter((o) => ["nouvelle", "acceptee", "route"].includes(o.status)) : [];
    } catch {
      return [];
    }
  }

  async function syncSubscriptions() {
    if (!socket?.connected || !token) return;
    const orders = await getActiveOrders();
    const next = new Set(orders.map((o) => String(o.id || o._id)).filter(Boolean));
    for (const id of next) if (!watched.has(id)) socket.emit("order:watch", id);
    for (const id of watched) if (!next.has(id)) socket.emit("order:unwatch", id);
    watched = next;
  }

  function connect() {
    if (!window.io || !token) return;
    if (socket) socket.disconnect();
    socket = window.io(API, { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("connect", syncSubscriptions);
    socket.on("order:snapshot", (snapshot) => window.dispatchEvent(new CustomEvent("velto:realtime-order", { detail: snapshot })));
    socket.on("order:update", (snapshot) => window.dispatchEvent(new CustomEvent("velto:realtime-order", { detail: snapshot })));
    socket.on("driver:offer", (offer) => window.dispatchEvent(new CustomEvent("velto:realtime-offer", { detail: offer })));
    socket.on("connect_error", () => {});
  }

  async function boot() {
    token = localStorage.getItem("velto_token") || null;
    if (!token) { if (socket) socket.disconnect(); return; }
    try { await loadSocketIO(); connect(); } catch {}
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "velto_token") { token = localStorage.getItem("velto_token") || null; boot(); }
  });

  boot();
  if (!refreshTimer) refreshTimer = setInterval(() => {
    const current = localStorage.getItem("velto_token") || null;
    if (current !== token) { token = current; boot(); }
    else syncSubscriptions();
  }, 5000);
})();
