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

let orders = [];
let currentUser = null; // { id, role, name }
let authToken = localStorage.getItem("wassel_token") || null;

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
    localStorage.removeItem("wassel_token");
    authToken = null;
    showAuthView();
  }
}

function onLoggedIn(user, token) {
  currentUser = user;
  authToken = token;
  localStorage.setItem("wassel_token", token);

  document.getElementById("topbar-user").classList.remove("hidden");
  document.getElementById("user-name").textContent = `${user.name} (${user.role === "client" ? "Client" : "Livreur"})`;

  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${user.role}`).classList.add("active");

  fetchOrders();
  setInterval(fetchOrders, 3000);
}

function logout() {
  localStorage.removeItem("wassel_token");
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

  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const role = document.getElementById("register-role").value;

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
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
  if (!authToken) return;
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
      body: JSON.stringify({ pickup, dropoff, pkg }),
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

function buildCard(order, actions) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".order-card");

  card.querySelector(".order-id").textContent = `Commande #${order.id.slice(-5)}`;

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

function renderList(containerId, list, emptyMessage, actionsFor) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = emptyMessage;
    container.appendChild(p);
    return;
  }

  list.forEach((order) => {
    container.appendChild(buildCard(order, actionsFor(order)));
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
    ]
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
    }
  );
}

function renderAll() {
  if (!currentUser) return;
  if (currentUser.role === "client") renderClientOrders();
  else renderLivreurViews();
}

// ---------- Init ----------
tryRestoreSession();