const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Order = require("./models/Order");
const User = require("./models/User");
const { requireAuth, requireRole, JWT_SECRET } = require("./middleware/auth");

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "32kb" }));

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wassel";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connecté à MongoDB"))
  .catch((err) => console.error("Erreur de connexion à MongoDB:", err.message));

const VALID_TRANSITIONS = {
  nouvelle: ["acceptee"],
  acceptee: ["route"],
  route: ["livree"],
  livree: [],
};

const VALID_ROLES = ["client", "livreur", "taxi"];
const VALID_PAYMENT_METHODS = ["especes", "carte", "wallet"];

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// ================= HEALTH =================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "wassel-backend" });
});

// ================= AUTH =================
app.post("/auth/register", async (req, res) => {
  try {
    const name = cleanString(req.body.name, 80);
    const email = cleanString(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = cleanString(req.body.role, 20);
    const country = cleanString(req.body.country, 2).toUpperCase() || "TN";
    const phone = cleanString(req.body.phone, 30);

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password et role sont requis" });
    }
    if (name.length < 2) {
      return res.status(400).json({ error: "Le nom est trop court" });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Email invalide" });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: "Le mot de passe doit contenir entre 6 et 128 caractères" });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "role doit être 'client', 'livreur' ou 'taxi'" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, role, country, phone });
    const token = signToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const email = cleanString(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "email et password sont requis" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================= ORDERS =================
app.get("/orders", requireAuth, async (req, res) => {
  try {
    let filter;
    if (req.user.role === "client") {
      filter = { client: req.user.id };
    } else if (req.user.role === "livreur") {
      filter = { $or: [{ status: "nouvelle" }, { livreur: req.user.id }] };
    } else {
      return res.json([]);
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/orders", requireAuth, requireRole("client"), async (req, res) => {
  try {
    const pickup = cleanString(req.body.pickup, 250);
    const dropoff = cleanString(req.body.dropoff, 250);
    const pkg = cleanString(req.body.pkg, 500);
    const paymentMethod = cleanString(req.body.paymentMethod, 20) || "especes";

    if (!pickup || !dropoff || !pkg) {
      return res.status(400).json({ error: "pickup, dropoff et pkg sont requis" });
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: "Méthode de paiement invalide" });
    }

    const order = await Order.create({
      pickup,
      dropoff,
      pkg,
      client: req.user.id,
      paymentMethod,
    });

    res.status(201).json(order);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Atomic status update prevents two livreurs from accepting the same order.
app.patch("/orders/:id/status", requireAuth, requireRole("livreur"), async (req, res) => {
  try {
    const { status } = req.body;

    if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, status) && status !== "acceptee") {
      return res.status(400).json({ error: "Statut invalide" });
    }

    if (status === "acceptee") {
      const order = await Order.findOneAndUpdate(
        { _id: req.params.id, status: "nouvelle", livreur: null },
        { $set: { status: "acceptee", livreur: req.user.id } },
        { new: true, runValidators: true }
      );

      if (!order) {
        return res.status(409).json({ error: "Commande déjà prise en charge ou introuvable" });
      }
      return res.json(order);
    }

    const order = await Order.findOne({ _id: req.params.id, livreur: req.user.id });
    if (!order) {
      return res.status(404).json({ error: "Commande introuvable ou non assignée" });
    }

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Transition invalide: ${order.status} -> ${status}` });
    }

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(400).json({ error: "Identifiant de commande invalide" });
    }
    console.error("Update order error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wassel API en écoute sur le port ${PORT}`);
});