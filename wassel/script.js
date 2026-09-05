// ---------- API config ----------
const API_URL = window.VELTO_API_URL;

const STATUS_LABELS = { nouvelle: "Nouvelle", acceptee: "Acceptée", route: "En route", livree: "Livrée", annulee: "Annulée" };
const STATUS_PROGRESS = { nouvelle: 0, acceptee: 15, route: 55, livree: 100, annulee: 100 };
const COMMISSION_RATE = 0.15;
const COUNTRY_CODES = ["US","CA","MX","BR","AR","GB","IE","FR","DE","ES","IT","PT","NL","BE","CH","SE","NO","DK","FI","PL","TR","UA","EG","MA","DZ","TN","NG","ZA","KE","SA","AE","IN","PK","BD","TH","VN","MY","SG","ID","PH","JP","KR","CN","AU","NZ"];
const displayNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([window.VELTO_LOCALE || "en"], { type: "region" }) : null;
const flagFor = code => String.fromCodePoint(...code.split("").map(letter => 127397 + letter.charCodeAt(0)));
const COUNTRIES = COUNTRY_CODES.map(code => ({ code, flag: flagFor(code), name: displayNames?.of(code) || code }));
let orders = [];
let currentUser = null;
let authToken = localStorage.getItem("velto_token") || null;
let selectedCountry = (navigator.language || "").split("-")[1]?.toUpperCase();
if (!COUNTRIES.some(country => country.code === selectedCountry)) selectedCountry = "US";
let selectedRole = null;
let selectedPayment = "especes";
let ordersInterval = null;
let lastOrdersSignature = "";

const countryGrid = document.getElementById("country-grid");
COUNTRIES.forEach((c, i) => {
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "chip" + (i === 0 ? " selected" : ""); btn.dataset.country = c.code; btn.innerHTML = `${c.flag} ${c.name}`;
  btn.addEventListener("click", () => { document.querySelectorAll("#country-grid .chip").forEach((el) => el.classList.remove("selected")); btn.classList.add("selected"); selectedCountry = c.code; }); countryGrid.appendChild(btn);
});
document.querySelectorAll(".role-card").forEach((card) => card.addEventListener("click", () => { document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected")); card.classList.add("selected"); selectedRole = card.dataset.role; }));
document.querySelectorAll(".btn-oauth").forEach((btn) => btn.addEventListener("click", () => alert(`La connexion avec ${btn.dataset.provider} arrive bientôt. Utilisez l'email pour l'instant.`)));
document.querySelectorAll(".payment-option").forEach((btn) => btn.addEventListener("click", () => { document.querySelectorAll(".payment-option").forEach((b) => b.classList.remove("active")); btn.classList.add("active"); selectedPayment = btn.dataset.payment; }));
document.querySelectorAll(".category-tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active")); tab.classList.add("active"); document.querySelectorAll(".category-panel").forEach((p) => p.classList.add("hidden")); const panel = document.getElementById(`category-${tab.dataset.category}`); if (panel) panel.classList.remove("hidden"); }));
function authHeaders() { return authToken ? { Authorization: `Bearer ${authToken}` } : {}; }
async function readJson(res) { const text = await res.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } }
async function refreshAccessToken() { const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } }); const data = await readJson(res); if (!res.ok || !data.token) throw new Error("Session expirée"); authToken = data.token; localStorage.setItem("velto_token", authToken); return authToken; }
async function tryRestoreSession() { try { if (!authToken) await refreshAccessToken(); let res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() }); if (res.status === 401) { await refreshAccessToken(); res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() }); } if (!res.ok) throw new Error("Session expirée"); const data = await readJson(res); if (!data.user) throw new Error("Session invalide"); onLoggedIn(data.user, authToken); } catch { logout(); } }
function onLoggedIn(user, token) {
  currentUser = user; authToken = token; localStorage.setItem("velto_token", token); document.getElementById("topbar-user").classList.remove("hidden");
  const roleLabel = { client: "Client", livreur: "Livreur", taxi: "Taxi", vendor: "Restaurant / Boutique", admin: "Admin" }[user.role] || user.role; document.getElementById("user-name").textContent = `${user.name} (${roleLabel})`;
  views.forEach((v) => v.classList.remove("active")); const roleView = document.getElementById(`view-${user.role}`); if (roleView) roleView.classList.add("active");
  if (user.role !== "livreur" && user.role !== "vendor") {
    fetchOrders();
    if (ordersInterval) clearInterval(ordersInterval);
    ordersInterval = setInterval(fetchOrders, 5000);
  } else if (ordersInterval) {
    clearInterval(ordersInterval);
    ordersInterval = null;
  }
  window.dispatchEvent(new CustomEvent("velto:auth", { detail: { user } }));
}
async function logout() { await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } }).catch(() => {}); if (ordersInterval) { clearInterval(ordersInterval); ordersInterval = null; } localStorage.removeItem("velto_token"); authToken = null; currentUser = null; orders = []; document.getElementById("topbar-user").classList.add("hidden"); showAuthView(); }
document.getElementById("delete-account-btn").addEventListener("click", async () => { const password = window.prompt("Pour confirmer, saisissez votre mot de passe. Cette action est irréversible."); if (!password) return; const res = await fetch(`${API_URL}/users/me`, { method: "DELETE", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const data = await readJson(res); if (!res.ok) return window.alert(data.error || "Suppression impossible."); window.alert(data.message || "Compte supprimé."); await logout(); });
function showAuthView() { views.forEach((v) => v.classList.remove("active")); document.getElementById("view-auth").classList.add("active"); }
document.getElementById("logout-btn").addEventListener("click", logout);
document.querySelectorAll("[data-mobile-nav]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-mobile-nav]").forEach((item) => item.classList.toggle("active", item === button));
  if (button.dataset.mobileNav === "orders") document.querySelector(".client-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
  else if (button.dataset.mobileNav === "account") document.getElementById("topbar-user")?.scrollIntoView({ behavior: "smooth", block: "start" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}));
let lastScrollY = window.scrollY;
window.addEventListener("scroll", () => {
  const currentScrollY = window.scrollY;
  document.body.classList.toggle("nav-collapsed", currentScrollY > 72 && currentScrollY > lastScrollY);
  if (currentScrollY < lastScrollY - 8) document.body.classList.remove("nav-collapsed");
  lastScrollY = currentScrollY;
}, { passive: true });
const authTabs = document.querySelectorAll(".auth-tab"); const loginForm = document.getElementById("login-form"); const registerForm = document.getElementById("register-form");
authTabs.forEach((tab) => tab.addEventListener("click", () => { authTabs.forEach((t) => t.classList.remove("active")); tab.classList.add("active"); const login = tab.dataset.auth === "login"; loginForm.classList.toggle("hidden", !login); registerForm.classList.toggle("hidden", login); }));
loginForm.addEventListener("submit", async (e) => { e.preventDefault(); const errorEl = document.getElementById("login-error"); errorEl.textContent = ""; try { const res = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("login-email").value.trim(), password: document.getElementById("login-password").value }) }); const data = await readJson(res); if (!res.ok) throw new Error(data.error || "Échec de la connexion"); onLoggedIn(data.user, data.token); } catch (err) { errorEl.textContent = err.message; } });
registerForm.addEventListener("submit", async (e) => { e.preventDefault(); const errorEl = document.getElementById("register-error"); errorEl.textContent = ""; if (!selectedRole) { errorEl.textContent = "Choisissez si vous êtes client, livreur, chauffeur taxi ou vendeur."; return; } try { const res = await fetch(`${API_URL}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("register-name").value.trim(), email: document.getElementById("register-email").value.trim(), password: document.getElementById("register-password").value, role: selectedRole, country: selectedCountry, phone: document.getElementById("register-phone").value.trim() }) }); const data = await readJson(res); if (!res.ok) throw new Error(data.error || "Échec de la création du compte"); onLoggedIn(data.user, data.token); } catch (err) { errorEl.textContent = err.message; } });
async function fetchOrders() { if (!authToken || !currentUser || currentUser.role === "livreur" || currentUser.role === "taxi" || currentUser.role === "vendor" || currentUser.role === "admin") return; try { const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() }); if (res.status === 401) return logout(); const data = await readJson(res); if (!res.ok) throw new Error(data.error || "Erreur de chargement"); const nextOrders = Array.isArray(data) ? data : []; const signature = nextOrders.map((order) => `${order.id || order._id}:${order.status}:${order.updatedAt || ""}`).join("|"); if (signature === lastOrdersSignature) return; orders = nextOrders; lastOrdersSignature = signature; } catch (err) { console.error("Impossible de contacter le serveur:", err); return; } renderAll(); }
async function createOrder(pickup, dropoff, pkg, pickupLocation, dropoffLocation) { try { const res = await fetch(`${API_URL}/orders`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ pickup, dropoff, pkg, serviceType: "colis", paymentMethod: selectedPayment, pickupLocation, dropoffLocation }) }); const data = await readJson(res); if (!res.ok) throw new Error(data.error || "Échec de la création de la commande"); orders.unshift(data); renderAll(); window.__veltoRefreshOrders?.(); } catch (err) { console.error(err); alert(err.message || "Impossible d'envoyer la commande."); } }
async function updateOrderStatus(id, status) { try { const res = await fetch(`${API_URL}/orders/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ status }) }); const data = await readJson(res); if (!res.ok) throw new Error(data.error || "Échec de la mise à jour"); const index = orders.findIndex((o) => o.id === id); if (index >= 0) orders[index] = data; renderAll(); } catch (err) { console.error(err); alert(err.message || "Impossible de mettre à jour la commande."); } }
const views = document.querySelectorAll(".view"); const orderForm = document.getElementById("order-form");
orderForm.addEventListener("submit", (e) => { e.preventDefault(); const pickup = document.getElementById("pickup").value.trim(); const dropoff = document.getElementById("dropoff").value.trim(); const pkg = document.getElementById("package").value.trim(); if (!pickup || !dropoff || !pkg) return; if (!window.veltoLocations?.pickup || !window.veltoLocations?.dropoff) return alert("Choisissez les deux positions sur la carte avant d'envoyer la commande."); createOrder(pickup, dropoff, pkg, window.veltoLocations.pickup, window.veltoLocations.dropoff); orderForm.reset(); window.veltoLocations = { pickup: null, dropoff: null }; if (window.veltoMapReset) window.veltoMapReset(); });
const template = document.getElementById("order-card-template"); const PAYMENT_LABELS = { especes: "Espèces", carte: "Carte", wallet: "Wallet" };
function buildCard(order, actions, index, { showEarnings } = {}) { const node = template.content.cloneNode(true); const card = node.querySelector(".order-card"); card.style.setProperty("--i", index); card.querySelector(".order-id").textContent = `#${String(order.id || "").slice(-5)}`; const statusEl = card.querySelector(".order-status"); statusEl.textContent = STATUS_LABELS[order.status] || order.status; statusEl.classList.add(`status-${order.status}`); const [pickupPoint, dropoffPoint] = card.querySelectorAll(".route-point"); pickupPoint.querySelector(".route-label").textContent = order.pickup; dropoffPoint.querySelector(".route-label").textContent = order.dropoff; const progress = STATUS_PROGRESS[order.status] ?? 0; card.querySelector(".route-progress").style.width = `${progress}%`; card.querySelector(".route-marker").style.left = `${progress}%`; card.querySelector(".package-desc").textContent = `📦 ${order.pkg}`; const fee = Number(order.fee ?? 0); const paymentLabel = PAYMENT_LABELS[order.paymentMethod] || "Espèces"; const feeText = window.VELTO_MONEY ? window.VELTO_MONEY(fee, order.currency || "USD") : `${fee.toFixed(2)} ${order.currency || "USD"}`; const feeLine = card.querySelector(".fee-line"); if (showEarnings) feeLine.textContent = `Frais: ${feeText} · Vous recevez: ${window.VELTO_MONEY ? window.VELTO_MONEY(Number(order.driverEarnings ?? fee * (1 - COMMISSION_RATE)), order.currency || "USD") : `${Number(order.driverEarnings ?? fee * (1 - COMMISSION_RATE)).toFixed(2)} ${order.currency || "USD"}`} · ${paymentLabel}`; else feeLine.textContent = `Frais de livraison: ${feeText} · ${paymentLabel}`; const actionsEl = card.querySelector(".order-actions"); actions.forEach(({ label, accent, onClick }) => { const btn = document.createElement("button"); btn.textContent = label; if (accent) btn.classList.add("accent"); btn.addEventListener("click", onClick); actionsEl.appendChild(btn); }); return node; }
function renderList(containerId, list, emptyMessage, actionsFor, opts) { const container = document.getElementById(containerId); if (!container) return; container.innerHTML = ""; if (!list.length) { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = emptyMessage; container.appendChild(p); return; } list.forEach((order, index) => container.appendChild(buildCard(order, actionsFor(order), index, opts))); }
function renderClientOrders() { renderList("client-orders", [...orders].reverse(), "Aucune commande pour l'instant. Remplissez le formulaire pour commencer.", () => []); }
function renderLivreurViews() { renderList("available-orders", orders.filter((o) => o.status === "nouvelle"), "Aucune commande disponible pour le moment.", (order) => [{ label: "Accepter la course", accent: true, onClick: () => updateOrderStatus(order.id, "acceptee") }], { showEarnings: true }); const mine = orders.filter((o) => ["acceptee", "route", "livree"].includes(o.status)); renderList("my-deliveries", [...mine].reverse(), "Vous n'avez accepté aucune course.", (order) => { if (order.status === "acceptee") return [{ label: "Démarrer la course", accent: true, onClick: () => updateOrderStatus(order.id, "route") }]; if (order.status === "route") return [{ label: "Marquer comme livrée", accent: true, onClick: () => updateOrderStatus(order.id, "livree") }]; return []; }, { showEarnings: true }); }
function renderAll() { if (!currentUser) return; if (currentUser.role === "client") renderClientOrders(); else if (currentUser.role === "livreur") renderLivreurViews(); }

// ================= REAL MAP =================
window.veltoLocations = { pickup: null, dropoff: null };
window.veltoMapReset = () => {};
const BASE_FEE_UI = 3, PRICE_PER_KM_UI = 0.8, MIN_FEE_UI = 5;
function haversineUi(a, b) { const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180, la1=a.lat*Math.PI/180, la2=b.lat*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.sin(dLng/2)**2*Math.cos(la1)*Math.cos(la2); return 2*R*Math.asin(Math.sqrt(x)); }
function loadLeaflet() { return new Promise((resolve, reject) => { if (window.L) return resolve(); const css=document.createElement("link"); css.rel="stylesheet"; css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css); const s=document.createElement("script"); s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }
async function initClientMap() {
  if (document.getElementById("velto-map")) return; await loadLeaflet();
  const form=document.getElementById("order-form"), box=document.createElement("div"); box.innerHTML=`<div id="velto-map" style="height:300px;border-radius:18px;overflow:hidden;border:1px solid rgba(36,28,16,.1);margin:4px 0"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="pick-pickup" class="btn-ghost">📍 Choisir départ</button><button type="button" id="pick-dropoff" class="btn-ghost">🎯 Choisir arrivée</button><button type="button" id="use-gps" class="btn-ghost">◎ Ma position</button></div><p id="route-estimate" style="margin:8px 0 0;color:#857a67;font-size:13px">Choisissez le départ et l'arrivée sur la carte.</p>`; form.insertBefore(box, form.querySelector(".payment-toggle"));
  const map=L.map("velto-map").setView([36.8065,10.1815],12); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(map); let mode="pickup", markers={};
  async function reverseGeocode(lat, lng) {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Adresse indisponible");
    const data = await response.json();
    return data.display_name || `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  async function place(type,latlng){
    const lat=Number(latlng.lat),lng=Number(latlng.lng);
    window.veltoLocations[type]={lat,lng};
    if(markers[type]) markers[type].setLatLng(latlng); else markers[type]=L.marker(latlng).addTo(map).bindPopup(type==="pickup"?"Départ":"Arrivée").openPopup();
    const input=document.getElementById(type === "pickup" ? "pickup" : "dropoff");
    if(input){ input.value=`${lat.toFixed(6)}, ${lng.toFixed(6)}`; input.dataset.coordinates=`${lat},${lng}`; }
    updateEstimate();
    try { const address=await reverseGeocode(lat,lng); if(input && window.veltoLocations[type]?.lat===lat && window.veltoLocations[type]?.lng===lng) input.value=address; } catch { if(input) input.value=`${lat.toFixed(6)}, ${lng.toFixed(6)}`; }
  }
  map.on("click",e=>{ place(mode,e.latlng); }); document.getElementById("pick-pickup").onclick=()=>mode="pickup"; document.getElementById("pick-dropoff").onclick=()=>mode="dropoff";
  document.getElementById("use-gps").onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{place(mode,{lat:p.coords.latitude,lng:p.coords.longitude});map.setView([p.coords.latitude,p.coords.longitude],15)},()=>alert("Impossible d'obtenir votre position."));
  function updateEstimate(){ const a=window.veltoLocations.pickup,b=window.veltoLocations.dropoff,el=document.getElementById("route-estimate"); if(!a||!b){el.textContent=`Mode: ${mode==="pickup"?"choix du départ":"choix de l'arrivée"}`;return;} const km=haversineUi(a,b),fee=Math.max(MIN_FEE_UI,BASE_FEE_UI+km*PRICE_PER_KM_UI); el.textContent=`Distance: ${km.toFixed(2)} km · Estimation: ${fee.toFixed(2)} DT · commission Velto: 15%`; }
  window.veltoMapReset=()=>{window.veltoLocations={pickup:null,dropoff:null};Object.values(markers).forEach(m=>map.removeLayer(m));markers={};updateEstimate();};
}
window.addEventListener("velto:auth", event => { if (event.detail?.user?.role === "client") setTimeout(() => initClientMap().catch(error => console.error("Client map initialization failed:", error)), 0); });
tryRestoreSession();
