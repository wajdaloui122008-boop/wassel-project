// ---------- API config ----------
const API_URL = "https://wassel-backend-ds3n.onrender.com";

const STATUS_LABELS = {
  nouvelle: "Nouvelle",
  acceptee: "Acceptée",
  route: "En route",
  livree: "Livrée",
};

const STATUS_PROGRESS = {
  nouvelle: 0,
  acceptee: 15,
  route: 55,
  livree: 100,
};

// Platform commission taken from the livreur's delivery fee.
// Kept lower than the 20-30% typical of established delivery apps
// to make Velto more attractive to early livreurs.
const COMMISSION_RATE = 0.15;

const COUNTRIES = [
  { code: "TN", flag: "🇹🇳", name: "Tunisie" },
  { code: "DZ", flag: "🇩🇿", name: "Algérie" },
  { code: "MA", flag: "🇲🇦", name: "Maroc" },
  { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "DE", flag: "🇩🇪", name: "Allemagne" },
  { code: "BE", flag: "🇧🇪", name: "Belgique" },
  { code: "CA", flag: "🇨🇦", name: "Canada" },
  { code: "AE", flag: "🇦🇪", name: "Émirats" },
];

let orders = [];
let currentUser = null; // { id, role, name }
let authToken = localStorage.getItem("velto_token") || null;
let selectedCountry = "TN";
let selectedRole = null;
let selectedPayment = "especes";

// ---------- Onboarding: country + role pickers ----------
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

document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedRole = card.dataset.role;
  });
});

// ---------- OAuth stubs (honest placeholder — no real provider wired up) ----------
document.querySelectorAll(".btn-oauth").forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`La connexion avec ${btn.dataset.provider} arrive bientôt. Utilisez l'email pour l'instant.`);
  });
});

// ---------- Payment method toggle ----------
document.querySelectorAll(".payment-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".payment-option").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPayment = btn.dataset.payment;
  });
});

// ---------- Category tabs (client home) ----------
document.querySelectorAll(".category-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".category-panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`category-${tab.dataset.category}`).classList.remove("hidden");
  });
});

// ---------- Auth helpers ----------
function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function tryRestoreSession() {
  if (!authToken) return showAuthView();

  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Session expirée");
    const data = await res.json();
    onLoggedIn(data.user, authToken);
  } catch (err) {
    localStorage.removeItem("velto_token");
    authToken = null;
    showAuthView();
  }
}

function onLoggedIn(user, token) {
  currentUser = user;
  authToken = token;
  localStorage.setItem("velto_token", token);

  document.getElementById("topbar-user").classList.remove("hidden");
  const roleLabel = { client: "Client", livreur: "Livreur", taxi: "Taxi" }[user.role] || user.role;
  document.getElementById("user-name").textContent = `${user.name} (${roleLabel})`;

  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${user.role}`).classList.add("active");

  fetchOrders();
  setInterval(fetchOrders, 3000);
}

function logout() {
  localStorage.removeItem("velto_token");
  authToken = null;
  currentUser = null;
  document.getElementById("topbar-user").classList.add("hidden");
  showAuthView();
}

function showAuthView() {
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById("view-auth").classList.add("active");
}

document.getElementById("logout-btn").addEventListener("click", logout);

// ---------- Auth tab switching ----------
const authTabs = document.querySelectorAll(".auth-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    authTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    if (tab.dataset.auth === "login") {
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
    } else {
      registerForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
    }
  });
});

// ---------- Login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de la connexion");

    onLoggedIn(data.user, data.token);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Register ----------
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("register-error");
  errorEl.textContent = "";

  if (!selectedRole) {
    errorEl.textContent = "Choisissez si vous êtes client, livreur ou chauffeur taxi.";
    return;
  }

  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();
  const password = document.getElementById("register-password").value;

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role: selectedRole,
        country: selectedCountry,
        phone,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de la création du compte");

    onLoggedIn(data.user, data.token);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Orders API ----------
async function fetchOrders() {
  if (!authToken || currentUser?.role === "taxi") return;
  try {
    const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
    if (res.status === 401) return logout();
    orders = await res.json();
  } catch (err) {
    console.error("Impossible de contacter le serveur:", err);
  }
  renderAll();
}

async function createOrder(pickup, dropoff, pkg) {
  try {
    const res = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pickup, dropoff, pkg, paymentMethod: selectedPayment }),
    });
    if (!res.ok) throw new Error("Échec de la création de la commande");
    await fetchOrders();
  } catch (err) {
    console.error(err);
    alert("Impossible d'envoyer la commande. Vérifiez que le serveur tourne.");
  }
}

async function updateOrderStatus(id, status) {
  try {
    const res = await fetch(`${API_URL}/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
    await fetchOrders();
  } catch (err) {
    console.error(err);
    alert(err.message || "Impossible de mettre à jour la commande.");
  }
}

// ---------- Views ----------
const views = document.querySelectorAll(".view");

// ---------- Order creation (client) ----------
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

// ---------- Card rendering ----------
const template = document.getElementById("order-card-template");
const PAYMENT_LABELS = { especes: "Espèces", carte: "Carte", wallet: "Wallet" };

function buildCard(order, actions, index, { showEarnings } = {}) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".order-card");
  card.style.setProperty("--i", index); // staggered entrance animation delay

  card.querySelector(".order-id").textContent = `#${order.id.slice(-5)}`;

  const statusEl = card.querySelector(".order-status");
  statusEl.textContent = STATUS_LABELS[order.status];
  statusEl.classList.add(`status-${order.status}`);

  const [pickupPoint, dropoffPoint] = card.querySelectorAll(".route-point");
  pickupPoint.querySelector(".route-label").textContent = order.pickup;
  dropoffPoint.querySelector(".route-label").textContent = order.dropoff;

  const progress = STATUS_PROGRESS[order.status];
  card.querySelector(".route-progress").style.width = `${progress}%`;
  card.querySelector(".route-marker").style.left = `${progress}%`;

  card.querySelector(".package-desc").textContent = `📦 ${order.pkg}`;

  const fee = order.fee ?? 8;
  const paymentLabel = PAYMENT_LABELS[order.paymentMethod] || "Espèces";
  const feeLine = card.querySelector(".fee-line");
  if (showEarnings) {
    const earnings = (fee * (1 - COMMISSION_RATE)).toFixed(2);
    feeLine.textContent = `Frais: ${fee.toFixed(2)} DT · Vous recevez: ${earnings} DT (commission Velto 15%) · ${paymentLabel}`;
  } else {
    feeLine.textContent = `Frais de livraison: ${fee.toFixed(2)} DT · ${paymentLabel}`;
  }

  const actionsEl = card.querySelector(".order-actions");
  actions.forEach(({ label, accent, onClick }) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    if (accent) btn.classList.add("accent");
    btn.addEventListener("click", onClick);
    actionsEl.appendChild(btn);
  });

  return node;
}

function renderList(containerId, list, emptyMessage, actionsFor, opts) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = emptyMessage;
    container.appendChild(p);
    return;
  }

  list.forEach((order, index) => {
    container.appendChild(buildCard(order, actionsFor(order), index, opts));
  });
}

function renderClientOrders() {
  renderList(
    "client-orders",
    [...orders].reverse(),
    "Aucune commande pour l'instant. Remplissez le formulaire pour commencer.",
    () => []
  );
}

function renderLivreurViews() {
  const available = orders.filter((o) => o.status === "nouvelle");
  renderList(
    "available-orders",
    available,
    "Aucune commande disponible pour le moment.",
    (order) => [
      {
        label: "Accepter la course",
        accent: true,
        onClick: () => updateOrderStatus(order.id, "acceptee"),
      },
    ],
    { showEarnings: true }
  );

  const mine = orders.filter(
    (o) => o.status === "acceptee" || o.status === "route" || o.status === "livree"
  );
  renderList(
    "my-deliveries",
    [...mine].reverse(),
    "Vous n'avez accepté aucune course.",
    (order) => {
      if (order.status === "acceptee") {
        return [
          {
            label: "Démarrer la course",
            accent: true,
            onClick: () => updateOrderStatus(order.id, "route"),
          },
        ];
      }
      if (order.status === "route") {
        return [
          {
            label: "Marquer comme livrée",
            accent: true,
            onClick: () => updateOrderStatus(order.id, "livree"),
          },
        ];
      }
      return [];
    },
    { showEarnings: true }
  );
}

function renderAll() {
  if (!currentUser) return;
  if (currentUser.role === "client") renderClientOrders();
  else if (currentUser.role === "livreur") renderLivreurViews();
}

// ---------- Init ----------
tryRestoreSession();