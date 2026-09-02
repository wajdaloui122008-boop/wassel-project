(() => {
  const API = "https://wassel-backend-ds3n.onrender.com";
  const token = () => localStorage.getItem("velto_token") || "";
  const headers = () => ({ Authorization: `Bearer ${token()}` });
  let mounted = false;
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const money = value => `${Number(value || 0).toFixed(2)} TND`;
  function tokenUser() { try { const part = token().split(".")[1]; if (!part) return null; const json = decodeURIComponent(atob(part.replace(/-/g,"+").replace(/_/g,"/")).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")); return JSON.parse(json); } catch { return null; } }
  function ensureView() {
    let view = document.getElementById("view-admin");
    if (view) return view;
    view = document.createElement("section"); view.id = "view-admin"; view.className = "view";
    view.innerHTML = `<div class="glass-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h1>Tableau de bord</h1><p class="subtitle">Supervision de Velto en temps réel.</p></div><button id="admin-refresh" class="btn-ghost">↻ Actualiser</button></div><div id="admin-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:20px"></div></div><div class="two-col"><div class="glass-panel"><h2>Utilisateurs</h2><div id="admin-users" class="orders-list"><p class="empty-state">Chargement…</p></div></div><div class="glass-panel"><h2>Commandes récentes</h2><div id="admin-orders" class="orders-list"><p class="empty-state">Chargement…</p></div></div></div>`;
    document.querySelector("main")?.appendChild(view); return view;
  }
  async function get(path) { const response = await fetch(`${API}${path}`, { headers: headers() }); let data={}; try{data=await response.json()}catch{} if(!response.ok)throw new Error(data.error||`Erreur ${response.status}`); return data; }
  const statCard=(label,value)=>`<div class="glass-panel" style="padding:16px"><small style="opacity:.7">${esc(label)}</small><strong style="display:block;font-size:25px;margin-top:7px">${esc(value)}</strong></div>`;
  async function refresh() { const view=ensureView(), stats=view.querySelector("#admin-stats"); try { const [s,users,orders]=await Promise.all([get("/admin/stats"),get("/admin/users?limit=8"),get("/admin/orders?limit=8")]); stats.innerHTML=[statCard("Utilisateurs",s.users),statCard("Chauffeurs",s.drivers),statCard("Commandes",s.orders),statCard("Livrées",s.delivered),statCard("Chiffre d'affaires",money(s.financials?.total)),statCard("Commission",money(s.financials?.commission))].join(""); view.querySelector("#admin-users").innerHTML=users.length?users.map(u=>`<article class="order-card"><b>${esc(u.name)}</b><span>${esc(u.email)}</span><small>${esc(u.role)} · ${esc(u.country||"TN")}</small></article>`).join(""):"<p class=\"empty-state\">Aucun utilisateur.</p>"; view.querySelector("#admin-orders").innerHTML=orders.length?orders.map(o=>`<article class="order-card"><div class="order-card-head"><b>#${esc(String(o._id||o.id||"").slice(-5))}</b><span>${esc(o.status)}</span></div><span>${esc(o.serviceType)} · ${esc(o.pickup)} → ${esc(o.dropoff)}</span><strong>${money(o.fee)}</strong></article>`).join(""):"<p class=\"empty-state\">Aucune commande.</p>"; } catch(error) { stats.innerHTML=`<p class="form-error">${esc(error.message)}</p>`; } }
  function mount(user) { if(!user||user.role!=="admin")return; const view=ensureView(); document.querySelectorAll(".view").forEach(v=>v.classList.remove("active")); view.classList.add("active"); if(!mounted){mounted=true;view.querySelector("#admin-refresh").onclick=refresh;refresh();setInterval(()=>{if(view.classList.contains("active"))refresh()},15000)} }
  window.addEventListener("velto:auth",event=>mount(event.detail?.user));
  setInterval(()=>{const u=tokenUser();if(u?.role==="admin")mount(u)},1500);
})();
