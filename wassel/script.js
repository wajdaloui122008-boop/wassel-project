// ---------- API config ----------
const API_URL = "https://wassel-backend-ds3n.onrender.com";

const STATUS_LABELS = { nouvelle: "Nouvelle", acceptee: "Acceptée", route: "En route", livree: "Livrée" };
const STATUS_PROGRESS = { nouvelle: 0, acceptee: 15, route: 55, livree: 100 };
const COMMISSION_RATE = 0.15;
const COUNTRIES = [
  { code: "TN", flag: "🇹🇳", name: "Tunisie" }, { code: "DZ", flag: "🇩🇿", name: "Algérie" },
  { code: "MA", flag: "🇲🇦", name: "Maroc" }, { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "DE", flag: "🇩🇪", name: "Allemagne" }, { code: "BE", flag: "🇧🇪", name: "Belgique" },
  { code: "CA", flag: "🇨🇦", name: "Canada" }, { code: "AE", flag: "🇦🇪", name: "Émirats" },
];

let orders = [];
let currentUser = null;
let authToken = localStorage.getItem("velto_token") || null;
let selectedCountry = "TN";
let selectedRole = null;
let selectedPayment = "especes";
let ordersInterval = null;

const countryGrid = document.getElementById("country-grid");
COUNTRIES.forEach((c, i) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip" + (i === 0 ? " selected" : "");
  btn.dataset.country = c.code;
  btn.innerHTML = `${c.flag} ${c.name}`;
  btn.addEventListener("click", () => {
    document.querySelectorAll("#country-grid .chip").forEach((el) => el.classList.remove("selected"));
    btn.classList.add("selected");
    selectedCountry = c.code;
  });
  countryGrid.appendChild(btn);
});

document.querySelectorAll(".role-card").forEach((card) => card.addEventListener("click", () => {
  document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");
  selectedRole = card.dataset.role;
}));

document.querySelectorAll(".btn-oauth").forEach((btn) => btn.addEventListener("click", () => {
  alert(`La connexion avec ${btn.dataset.provider} arrive bientôt. Utilisez l'email pour l'instant.`);
}));

document.querySelectorAll(".payment-option").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".payment-option").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  selectedPayment = btn.dataset.payment;
}));

document.querySelectorAll(".category-tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  document.querySelectorAll(".category-panel").forEach((p) => p.classList.add("hidden"));
  const panel = document.getElementById(`category-${tab.dataset.category}`);
  if (panel) panel.classList.remove("hidden");
}));

function authHeaders() { return authToken ? { Authorization: `Bearer ${authToken}` } : {}; }

async function readJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

async function tryRestoreSession() {
  if (!authToken) return showAuthView();
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Session expirée");
    const data = await readJson(res);
    if (!data.user) throw new Error("Session invalide");
    onLoggedIn(data.user, authToken);
  } catch {
    logout();
  }
}

function onLoggedIn(user, token) {
  currentUser = user;
  authToken = token;
  localStorage.setItem("velto_token", token);
  document.getElementById("topbar-user").classList.remove("hidden");
  const roleLabel = { client: "Client", livreur: "Livreur", taxi: "Taxi", admin: "Admin" }[user.role] || user.role;
  document.getElementById("user-name").textContent = `${user.name} (${roleLabel})`;
  views.forEach((v) => v.classList.remove("active"));
  const roleView = document.getElementById(`view-${user.role}`);
  if (roleView) roleView.classList.add("active");
  fetchOrders();
  if (ordersInterval) clearInterval(ordersInterval);
  ordersInterval = setInterval(fetchOrders, 5000);
}

function logout() {
  if (ordersInterval) { clearInterval(ordersInterval); ordersInterval = null; }
  localStorage.removeItem("velto_token");
  authToken = null;
  currentUser = null;
  orders = [];
  document.getElementById("topbar-user").classList.add("hidden");
  showAuthView();
}

function showAuthView() {
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById("view-auth").classList.add("active");
}

document.getElementById("logout-btn").addEventListener("click", logout);

const authTabs = document.querySelectorAll(".auth-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
authTabs.forEach((tab) => tab.addEventListener("click", () => {
  authTabs.forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  const login = tab.dataset.auth === "login";
  loginForm.classList.toggle("hidden", !login);
  registerForm.classList.toggle("hidden", login);
}));

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("login-email").value.trim(), password: document.getElementById("login-password").value }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Échec de la connexion");
    onLoggedIn(data.user, data.token);
  } catch (err) { errorEl.textContent = err.message; }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("register-error");
  errorEl.textContent = "";
  if (!selectedRole) { errorEl.textContent = "Choisissez si vous êtes client, livreur ou chauffeur taxi."; return; }
  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("register-name").value.trim(),
        email: document.getElementById("register-email").value.trim(),
        password: document.getElementById("register-password").value,
        role: selectedRole, country: selectedCountry,
        phone: document.getElementById("register-phone").value.trim(),
      }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Échec de la création du compte");
    onLoggedIn(data.user, data.token);
  } catch (err) { errorEl.textContent = err.message; }
});

async function fetchOrders() {
  if (!authToken || !currentUser || currentUser.role === "taxi" || currentUser.role === "admin") return;
  try {
    const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Erreur de chargement");
    orders = Array.isArray(data) ? data : [];
  } catch (err) { console.error("Impossible de contacter le serveur:", err); }
  renderAll();
}

async function createOrder(pickup, dropoff, pkg) {
  try {
    const res = await fetch(`${API_URL}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pickup, dropoff, pkg, paymentMethod: selectedPayment }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Échec de la création de la commande");
    orders.unshift(data);
    renderAll();
  } catch (err) { console.error(err); alert(err.message || "Impossible d'envoyer la commande."); }
}

async function updateOrderStatus(id, status) {
  try {
    const res = await fetch(`${API_URL}/orders/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
    const index = orders.findIndex((o) => o.id === id);
    if (index >= 0) orders[index] = data;
    renderAll();
  } catch (err) { console.error(err); alert(err.message || "Impossible de mettre à jour la commande."); }
}

const views = document.querySelectorAll(".view");
const orderForm = document.getElementById("order-form");
orderForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pickup = document.getElementById("pickup").value.trim();
  const dropoff = document.getElementById("dropoff").value.trim();
  const pkg = document.getElementById("package").value.trim();
  if (!pickup || !dropoff || !pkg) return;
  createOrder(pickup, dropoff, pkg);
  orderForm.reset();
});

const template = document.getElementById("order-card-template");
const PAYMENT_LABELS = { especes: "Espèces", carte: "Carte", wallet: "Wallet" };
function buildCard(order, actions, index, { showEarnings } = {}) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".order-card");
  card.style.setProperty("--i", index);
  card.querySelector(".order-id").textContent = `#${order.id.slice(-5)}`;
  const statusEl = card.querySelector(".order-status");
  statusEl.textContent = STATUS_LABELS[order.status] || order.status;
  statusEl.classList.add(`status-${order.status}`);
  const [pickupPoint, dropoffPoint] = card.querySelectorAll(".route-point");
  pickupPoint.querySelector(".route-label").textContent = order.pickup;
  dropoffPoint.querySelector(".route-label").textContent = order.dropoff;
  const progress = STATUS_PROGRESS[order.status] ?? 0;
  card.querySelector(".route-progress").style.width = `${progress}%`;
  card.querySelector(".route-marker").style.left = `${progress}%`;
  card.querySelector(".package-desc").textContent = `📦 ${order.pkg}`;
  const fee = Number(order.fee ?? 8);
  const paymentLabel = PAYMENT_LABELS[order.paymentMethod] || "Espèces";
  const feeLine = card.querySelector(".fee-line");
  if (showEarnings) {
    const earnings = (fee * (1 - COMMISSION_RATE)).toFixed(2);
    feeLine.textContent = `Frais: ${fee.toFixed(2)} DT · Vous recevez: ${earnings} DT (commission Velto 15%) · ${paymentLabel}`;
  } else feeLine.textContent = `Frais de livraison: ${fee.toFixed(2)} DT · ${paymentLabel}`;
  const actionsEl = card.querySelector(".order-actions");
  actions.forEach(({ label, accent, onClick }) => {
    const btn = document.createElement("button"); btn.textContent = label;
    if (accent) btn.classList.add("accent");
    btn.addEventListener("click", onClick); actionsEl.appendChild(btn);
  });
  return node;
}

function renderList(containerId, list, emptyMessage, actionsFor, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (!list.length) { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = emptyMessage; container.appendChild(p); return; }
  list.forEach((order, index) => container.appendChild(buildCard(order, actionsFor(order), index, opts)));
}

function renderClientOrders() {
  renderList("client-orders", [...orders].reverse(), "Aucune commande pour l'instant. Remplissez le formulaire pour commencer.", () => []);
}

function renderLivreurViews() {
  renderList("available-orders", orders.filter((o) => o.status === "nouvelle"), "Aucune commande disponible pour le moment.", (order) => [{ label: "Accepter la course", accent: true, onClick: () => updateOrderStatus(order.id, "acceptee") }], { showEarnings: true });
  const mine = orders.filter((o) => ["acceptee", "route", "livree"].includes(o.status));
  renderList("my-deliveries", [...mine].reverse(), "Vous n'avez accepté aucune course.", (order) => {
    if (order.status === "acceptee") return [{ label: "Démarrer la course", accent: true, onClick: () => updateOrderStatus(order.id, "route") }];
    if (order.status === "route") return [{ label: "Marquer comme livrée", accent: true, onClick: () => updateOrderStatus(order.id, "livree") }];
    return [];
  }, { showEarnings: true });
}

function renderAll() {
  if (!currentUser) return;
  if (currentUser.role === "client") renderClientOrders();
  else if (currentUser.role === "livreur") renderLivreurViews();
}

tryRestoreSession();
