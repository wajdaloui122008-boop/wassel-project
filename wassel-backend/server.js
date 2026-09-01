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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://wassel-project.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin non autorisée par CORS"));
  },
}));
app.use(express.json({ limit: "32kb" }));

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wassel";
const BASE_FEE = Number(process.env.BASE_FEE_TND || 3);
const PRICE_PER_KM = Number(process.env.PRICE_PER_KM_TND || 0.8);
const MIN_FEE = Number(process.env.MIN_FEE_TND || 5);
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.15);
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 20;
const MAX_PAGE_SIZE = 50;
const DRIVER_DISPATCH_LIMIT = 30;
const DRIVER_DISPATCH_RADIUS_KM = 20;
const authAttempts = new Map();
let dbReady = false;

mongoose.connection.on("connected", () => { dbReady = true; console.log("Connecté à MongoDB"); });
mongoose.connection.on("disconnected", () => { dbReady = false; console.error("MongoDB déconnecté"); });
mongoose
  .connect(MONGODB_URI)
  .catch((err) => console.error("Erreur de connexion à MongoDB:", err.message));

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function parsePagination(req) {
  const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(req.query.limit || "20", 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}
function authRateLimit(req, res, next) {
  const key = `${req.ip || "unknown"}:${cleanString(req.body?.email, 160).toLowerCase() || "no-email"}`;
  const now = Date.now();
  const previous = authAttempts.get(key);
  if (!previous || now - previous.startedAt >= AUTH_WINDOW_MS) {
    authAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  previous.count += 1;
  if (previous.count > AUTH_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((AUTH_WINDOW_MS - (now - previous.startedAt)) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Trop de tentatives. Réessayez plus tard." });
  }
  return next();
}
setInterval(() => {
  const cutoff = Date.now() - AUTH_WINDOW_MS;
  for (const [key, value] of authAttempts) if (value.startedAt < cutoff) authAttempts.delete(key);
}, AUTH_WINDOW_MS).unref();

const VALID_TRANSITIONS = {
  nouvelle: ["acceptee", "annulee"],
  acceptee: ["route", "annulee"],
  route: ["livree"],
  livree: [],
  annulee: [],
};
const VALID_ROLES = ["client", "livreur", "taxi"];
const VALID_PAYMENT_METHODS = ["especes", "carte", "wallet"];
const VALID_SERVICE_TYPES = ["colis", "food", "taxi", "shop", "market"];

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}
function validCoordinatePair(value) {
  return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) &&
    Number(value.lat) >= -90 && Number(value.lat) <= 90 && Number(value.lng) >= -180 && Number(value.lng) <= 180;
}
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function calculatePricing(distanceKm) {
  const fee = Math.max(MIN_FEE, BASE_FEE + distanceKm * PRICE_PER_KM);
  const roundedFee = Math.round(fee * 10) / 10;
  const commission = Math.round(roundedFee * COMMISSION_RATE * 10) / 10;
  return { fee: roundedFee, commission, driverEarnings: Math.round((roundedFee - commission) * 10) / 10 };
}

app.get("/health", (req, res) => {
  const payload = { ok: dbReady, service: "wassel-backend", database: dbReady ? "connected" : "disconnected" };
  res.status(dbReady ? 200 : 503).json(payload);
});

app.post("/auth/register", authRateLimit, async (req, res) => {
  try {
    const name = cleanString(req.body.name, 80);
    const email = cleanString(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = cleanString(req.body.role, 20);
    const country = cleanString(req.body.country, 2).toUpperCase() || "TN";
    const phone = cleanString(req.body.phone, 30);
    if (!name || !email || !password || !role) return res.status(400).json({ error: "name, email, password et role sont requis" });
    if (name.length < 2) return res.status(400).json({ error: "Le nom est trop court" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Email invalide" });
    if (password.length < 6 || password.length > 128) return res.status(400).json({ error: "Le mot de passe doit contenir entre 6 et 128 caractères" });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "role doit être 'client', 'livreur' ou 'taxi'" });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, role, country, phone });
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    console.error("Register error:", err); res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/auth/login", authRateLimit, async (req, res) => {
  try {
    const email = cleanString(req.body.email, 160).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "email et password sont requis" });
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    res.json({ token: signToken(user), user });
  } catch (err) { console.error("Login error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json({ user });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.patch("/drivers/me/status", requireAuth, requireRole("livreur"), async (req, res) => {
  const isOnline = Boolean(req.body.isOnline);
  const isAvailable = isOnline ? Boolean(req.body.isAvailable) : false;
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { isOnline, isAvailable } }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: "Livreur introuvable" });
  res.json({ user });
});

app.patch("/drivers/me/location", requireAuth, requireRole("livreur"), async (req, res) => {
  if (!validCoordinatePair(req.body)) return res.status(400).json({ error: "Coordonnées GPS invalides" });
  const location = { lat: Number(req.body.lat), lng: Number(req.body.lng), updatedAt: new Date() };
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { location } }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: "Livreur introuvable" });
  res.json({ location: user.location });
});

app.get("/drivers/nearby", requireAuth, requireRole("client"), async (req, res) => {
  if (!validCoordinatePair(req.query)) return res.status(400).json({ error: "Coordonnées GPS invalides" });
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const radiusKm = Math.min(Math.max(Number(req.query.radiusKm || 10), 1), 50);
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000);
  const drivers = await User.find({ role: "livreur", isOnline: true, isAvailable: true, "location.lat": { $exists: true }, "location.lng": { $exists: true }, "location.updatedAt": { $gte: staleCutoff } }).select("name location isOnline isAvailable");
  const result = drivers.map((d) => ({ user: d, distanceKm: haversineKm({ lat, lng }, d.location) })).filter((d) => d.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
  res.json(result);
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const serviceType = cleanString(req.query.serviceType, 20).toLowerCase();
    if (serviceType && !VALID_SERVICE_TYPES.includes(serviceType)) return res.status(400).json({ error: "Type de service invalide" });

    let filter;
    if (req.user.role === "client") filter = { client: req.user.id };
    else if (req.user.role === "livreur") filter = { $or: [{ status: "nouvelle" }, { livreur: req.user.id }] };
    else if (req.user.role === "admin") filter = {};
    else return res.json([]);
    if (serviceType) filter.serviceType = serviceType;

    let query = Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    let totalPromise = Order.countDocuments(filter);

    // Dispatch MVP: when a driver has a fresh GPS position, put nearby new jobs first
    // instead of dumping the entire queue in arbitrary creation order.
    if (req.user.role === "livreur") {
      const driver = await User.findById(req.user.id).select("location isOnline isAvailable");
      if (driver?.isOnline && driver?.isAvailable && validCoordinatePair(driver.location)) {
        const [newOrders, assignedOrders] = await Promise.all([
          Order.find({ status: "nouvelle", ...(serviceType ? { serviceType } : {}) }).sort({ createdAt: -1 }).limit(100),
          Order.find({ livreur: req.user.id, ...(serviceType ? { serviceType } : {}) }).sort({ createdAt: -1 }).skip(skip).limit(limit),
        ]);
        const nearby = newOrders
          .map((order) => ({ order, distanceKm: order.pickupLocation ? haversineKm(driver.location, order.pickupLocation) : Infinity }))
          .filter((item) => item.distanceKm <= DRIVER_DISPATCH_RADIUS_KM)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, DRIVER_DISPATCH_LIMIT)
          .map((item) => item.order);
        const merged = [...nearby, ...assignedOrders.filter((order) => !nearby.some((item) => String(item._id) === String(order._id)))];
        res.set("X-Total-Count", String(await totalPromise));
        res.set("X-Page", String(page));
        res.set("X-Limit", String(limit));
        return res.json(merged.slice(0, limit));
      }
    }

    const [orders, total] = await Promise.all([query, totalPromise]);
    res.set("X-Total-Count", String(total));
    res.set("X-Page", String(page));
    res.set("X-Limit", String(limit));
    res.json(orders);
  } catch (err) { console.error("Get orders error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/orders", requireAuth, requireRole("client"), async (req, res) => {
  try {
    const pickup = cleanString(req.body.pickup, 250), dropoff = cleanString(req.body.dropoff, 250), pkg = cleanString(req.body.pkg, 500);
    const serviceType = cleanString(req.body.serviceType, 20).toLowerCase();
    const paymentMethod = cleanString(req.body.paymentMethod, 20) || "especes";
    if (!pickup || !dropoff || !pkg) return res.status(400).json({ error: "pickup, dropoff et pkg sont requis" });
    if (!VALID_SERVICE_TYPES.includes(serviceType)) return res.status(400).json({ error: "Type de service invalide" });
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: "Méthode de paiement invalide" });
    if (!validCoordinatePair(req.body.pickupLocation) || !validCoordinatePair(req.body.dropoffLocation)) return res.status(400).json({ error: "Les positions pickup et dropoff sont requises" });
    const pickupLocation = { lat: Number(req.body.pickupLocation.lat), lng: Number(req.body.pickupLocation.lng) };
    const dropoffLocation = { lat: Number(req.body.dropoffLocation.lat), lng: Number(req.body.dropoffLocation.lng) };
    const distanceKm = Math.round(haversineKm(pickupLocation, dropoffLocation) * 100) / 100;
    const pricing = calculatePricing(distanceKm);
    const estimatedDurationMin = Math.max(5, Math.round(distanceKm * 3));
    const order = await Order.create({ pickup, dropoff, pickupLocation, dropoffLocation, distanceKm, estimatedDurationMin, pkg, client: req.user.id, serviceType, paymentMethod, ...pricing });
    res.status(201).json(order);
  } catch (err) { console.error("Create order error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.get("/orders/:id/tracking", requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("livreur", "name phone location isOnline isAvailable");
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    const allowed = req.user.role === "admin" || String(order.client) === req.user.id || (order.livreur && String(order.livreur._id) === req.user.id);
    if (!allowed) return res.status(403).json({ error: "Accès interdit" });
    res.json({ id: order.id, status: order.status, serviceType: order.serviceType, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, transactionId: order.transactionId || "", pickupLocation: order.pickupLocation || null, dropoffLocation: order.dropoffLocation || null, distanceKm: order.distanceKm, estimatedDurationMin: order.estimatedDurationMin, driver: order.livreur || null });
  } catch (err) { if (err?.name === "CastError") return res.status(400).json({ error: "Identifiant de commande invalide" }); console.error("Tracking error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/orders/:id/cancel", requireAuth, async (req, res) => {
  try {
    const reason = cleanString(req.body.reason, 300) || "Annulée par l'utilisateur";
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    const isClient = req.user.role === "client" && String(order.client) === req.user.id;
    const isDriver = req.user.role === "livreur" && order.livreur && String(order.livreur) === req.user.id;
    if (!isClient && !isDriver && req.user.role !== "admin") return res.status(403).json({ error: "Accès interdit" });
    const canCancel = req.user.role === "admin" || (isClient && ["nouvelle", "acceptee"].includes(order.status)) || (isDriver && order.status === "acceptee");
    if (!canCancel) return res.status(409).json({ error: "Cette commande ne peut plus être annulée" });
    order.status = "annulee";
    order.cancellationReason = reason;
    order.cancelledAt = new Date();
    order.cancelledBy = req.user.id;
    await order.save();
    if (isDriver) await User.findByIdAndUpdate(req.user.id, { $set: { isAvailable: true } });
    res.json(order);
  } catch (err) { if (err?.name === "CastError") return res.status(400).json({ error: "Identifiant de commande invalide" }); console.error("Cancel order error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.patch("/orders/:id/status", requireAuth, requireRole("livreur"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, status) && status !== "acceptee") return res.status(400).json({ error: "Statut invalide" });
    if (status === "acceptee") {
      const order = await Order.findOneAndUpdate({ _id: req.params.id, status: "nouvelle", livreur: null }, { $set: { status: "acceptee", livreur: req.user.id } }, { new: true, runValidators: true });
      if (!order) return res.status(409).json({ error: "Commande déjà prise en charge ou introuvable" });
      await User.findByIdAndUpdate(req.user.id, { $set: { isAvailable: false } });
      return res.json(order);
    }
    const order = await Order.findOne({ _id: req.params.id, livreur: req.user.id });
    if (!order) return res.status(404).json({ error: "Commande introuvable ou non assignée" });
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) return res.status(400).json({ error: `Transition invalide: ${order.status} -> ${status}` });
    order.status = status;
    await order.save();
    if (status === "livree") await User.findByIdAndUpdate(req.user.id, { $set: { isAvailable: true } });
    res.json(order);
  } catch (err) { if (err?.name === "CastError") return res.status(400).json({ error: "Identifiant de commande invalide" }); console.error("Update order error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

app.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [users, drivers, orders, delivered] = await Promise.all([
      User.countDocuments(), User.countDocuments({ role: "livreur" }), Order.countDocuments(), Order.countDocuments({ status: "livree" })
    ]);
    const revenue = await Order.aggregate([{ $match: { status: "livree" } }, { $group: { _id: null, total: { $sum: "$fee" }, commission: { $sum: "$commission" }, driverEarnings: { $sum: "$driverEarnings" } } }]);
    res.json({ users, drivers, orders, delivered, financials: revenue[0] || { total: 0, commission: 0, driverEarnings: 0 } });
  } catch (err) { console.error("Admin stats error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});
app.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const [users, total] = await Promise.all([User.find().sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments()]);
    res.set("X-Total-Count", String(total));
    res.json(users);
  } catch (err) { console.error("Admin users error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});
app.get("/admin/orders", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const [orders, total] = await Promise.all([Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit), Order.countDocuments()]);
    res.set("X-Total-Count", String(total));
    res.json(orders);
  } catch (err) { console.error("Admin orders error:", err); res.status(500).json({ error: "Erreur serveur" }); }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Wassel API en écoute sur le port ${PORT}`));
function shutdown(signal) {
  console.log(`${signal}: arrêt du serveur...`);
  server.close(() => mongoose.connection.close(false).finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
