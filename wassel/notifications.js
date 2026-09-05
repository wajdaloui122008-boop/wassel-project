(() => {
  const API = window.VELTO_API_URL;
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  let panel;
  async function load() {
    if (!token()) return;
    const response = await fetch(`${API}/notifications`, { headers: headers() });
    if (!response.ok) return;
    const items = await response.json();
    panel.innerHTML = items.length ? items.map((item) => `<button type="button" data-notification="${item.id || item._id}" style="display:block;width:100%;text-align:left;padding:10px;border:0;background:${item.readAt ? "transparent" : "rgba(214,178,94,.14)"}"><b>${item.title}</b><small style="display:block;opacity:.7">${item.body}</small></button>`).join("") : "<small>Aucune notification.</small>";
  }
  function mount() {
    if (document.getElementById("notification-button")) return;
    const button = document.createElement("button");
    button.id = "notification-button"; button.className = "btn-ghost"; button.textContent = "🔔 Notifications";
    panel = document.createElement("div"); panel.id = "notification-panel"; panel.hidden = true; panel.style = "position:fixed;right:16px;top:64px;width:min(360px,calc(100vw - 32px));z-index:100001;padding:10px;border-radius:16px;background:#fff;box-shadow:0 16px 45px rgba(0,0,0,.2)";
    document.body.append(panel); document.getElementById("topbar-user")?.prepend(button);
    button.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) load(); };
    panel.onclick = async (event) => { const item = event.target.closest("[data-notification]"); if (!item) return; await fetch(`${API}/notifications/${item.dataset.notification}/read`, { method: "PATCH", headers: headers() }); load(); };
    load();
  }
  window.addEventListener("velto:auth", mount);
})();
