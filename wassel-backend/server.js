const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Order = require("./models/Order");
const User = require("./models/User");
const { requireAuth, requireRole, JWT_SECRET } = require("./middleware/auth");

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Database connection ----------
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

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ================= AUTH =================

// POST /auth/register -> create a client or livreur account
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, role, country, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password et role sont requis" });
    }
    if (!["client", "livreur", "taxi"].includes(role)) {
      return res.status(400).json({ error: "role doit être 'client', 'livreur' ou 'taxi'" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      country: country || "TN",
      phone: phone || "",
    });

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /auth/login -> authenticate and get a token
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email et password sont requis" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /auth/me -> whoami, used by the frontend to restore a session
app.get("/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
  res.json({ user });
});

// ================= ORDERS =================

// GET /orders
// - clients see only their own orders
// - livreurs see: unassigned orders ("nouvelle") + orders they've accepted
app.get("/orders", requireAuth, async (req, res) => {
  try {
    let filter;
    if (req.user.role === "client") {
      filter = { client: req.user.id };
    } else if (req.user.role === "livreur") {
      filter = { $or: [{ status: "nouvelle" }, { livreur: req.user.id }] };
    } else {
      // taxi accounts: ride-hailing isn't built yet, no parcel orders to show
      return res.json([]);
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /orders -> a client creates a new order
app.post("/orders", requireAuth, requireRole("client"), async (req, res) => {
  try {
    const { pickup, dropoff, pkg, paymentMethod } = req.body;
    if (!pickup || !dropoff || !pkg) {
      return res.status(400).json({ error: "pickup, dropoff et pkg sont requis" });
    }

    const order = await Order.create({
      pickup,
      dropoff,
      pkg,
      client: req.user.id,
      paymentMethod: paymentMethod || "especes",
    });
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /orders/:id/status -> a livreur accepts/advances an order
app.patch("/orders/:id/status", requireAuth, requireRole("livreur"), async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Commande introuvable" });
    }

    // Accepting: order must be unassigned; assign this livreur to it
    if (status === "acceptee") {
      if (order.status !== "nouvelle") {
        return res.status(400).json({ error: "Commande déjà prise en charge" });
      }
      order.livreur = req.user.id;
    } else {
      // Any further transition must belong to this livreur
      if (!order.livreur || order.livreur.toString() !== req.user.id) {
        return res.status(403).json({ error: "Cette commande ne vous est pas assignée" });
      }
      const allowed = VALID_TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          error: `Transition invalide: ${order.status} -> ${status}`,
        });
      }
    }

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wassel API en écoute sur http://localhost:${PORT}`);
});