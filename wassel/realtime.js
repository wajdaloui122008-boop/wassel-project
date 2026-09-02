(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  let socket = null;
  let token = localStorage.getItem("velto_token") || null;
  let watched = new Set();

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

  function connect() {
    if (!window.io || !token) return;
    if (socket) socket.disconnect();
    socket = window.io(API, { auth: { token }, transports: ["websocket", "polling"] });

    socket.on("connect", async () => {
      const orders = await getActiveOrders();
      watched = new Set(orders.map((o) => String(o.id)));
      watched.forEach((id) => socket.emit("order:watch", id));
    });

    socket.on("order:snapshot", (snapshot) => window.dispatchEvent(new CustomEvent("velto:realtime-order", { detail: snapshot })));
    socket.on("order:update", (snapshot) => window.dispatchEvent(new CustomEvent("velto:realtime-order", { detail: snapshot })));
    socket.on("connect_error", () => {});
  }

  async function boot() {
    token = localStorage.getItem("velto_token") || null;
    if (!token) return;
    try { await loadSocketIO(); connect(); } catch {}
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "velto_token") {
      token = localStorage.getItem("velto_token") || null;
      if (token) boot(); else if (socket) socket.disconnect();
    }
  });

  boot();
  setInterval(() => {
    const current = localStorage.getItem("velto_token") || null;
    if (current !== token) { token = current; boot(); }
  }, 5000);
})();
