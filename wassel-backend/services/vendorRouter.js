const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const MenuItem = require("../models/MenuItem");
const VendorSettings = require("../models/VendorSettings");
const { requireAuth, requireVendor } = require("../middleware/auth");
const { notifyOrderStatus } = require("./notificationService");

const router = express.Router();
router.use(requireAuth, requireVendor);
const vendorId = (req) => req.user.role === "admin" && req.query.vendorId && mongoose.isValidObjectId(req.query.vendorId) ? req.query.vendorId : req.user.id;
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validTypes = new Set(["food", "shop", "market"]);
const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

router.get("/orders", async (req, res) => {
  const filter = { vendor: vendorId(req) };
  if (req.query.status && ["pending", "accepted", "rejected", "nouvelle", "acceptee", "route", "livree", "annulee"].includes(req.query.status)) {
    filter.$or = [{ vendorStatus: req.query.status }, { status: req.query.status }];
  }
  if (req.query.search) filter._id = mongoose.isValidObjectId(req.query.search) ? req.query.search : null;
  if (req.query.from || req.query.to) filter.createdAt = {};
  if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
  if (req.query.to) filter.createdAt.$lt = new Date(req.query.to);
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100).populate("client", "name phone").populate("livreur", "name phone");
  res.json(orders);
});

router.patch("/orders/:id/decision", async (req, res) => {
  const decision = clean(req.body.decision, 10);
  const reason = clean(req.body.reason, 40);
  if (!["accepted", "rejected"].includes(decision)) return res.status(400).json({ error: "Décision invalide" });
  if (decision === "rejected" && !["out_of_stock", "closing", "too_busy"].includes(reason)) return res.status(400).json({ error: "Motif de refus requis" });
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, vendor: vendorId(req), status: "nouvelle", vendorStatus: "pending" },
    { $set: { vendorStatus: decision, vendorRejectReason: decision === "rejected" ? reason : "", status: decision === "rejected" ? "annulee" : "nouvelle" } },
    { returnDocument: "after", runValidators: true },
  );
  if (!order) return res.status(409).json({ error: "Commande déjà traitée ou introuvable" });
  const io = global.__veltoIO;
  if (io) {
    io.to(`user:${String(order.client)}`).emit("vendor:order-update", { orderId: String(order._id), vendorStatus: order.vendorStatus, reason });
    if (decision === "rejected") io.to(`order:${String(order._id)}`).emit("order:update", order);
  }
  await notifyOrderStatus(order, decision === "accepted" ? "acceptee" : "annulee");
  res.json(order);
});

router.patch("/orders/:id/ready", async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, vendor: vendorId(req), vendorStatus: "accepted", status: "nouvelle", livreur: { $ne: null } },
    { $set: { readyAt: new Date(), pickupStatus: "ready" } },
    { returnDocument: "after", runValidators: true },
  ).populate("livreur", "name phone");
  if (!order) return res.status(409).json({ error: "La commande doit être acceptée et assignée à un livreur" });
  const io = global.__veltoIO;
  if (io) io.to(`user:${String(order.livreur._id || order.livreur)}`).emit("vendor:order-ready", { orderId: String(order._id), readyAt: order.readyAt });
  await notifyOrderStatus(order, "route");
  res.json(order);
});

router.get("/menu", async (req, res) => {
  const filter = { vendor: vendorId(req) };
  if (req.query.serviceType && validTypes.has(req.query.serviceType)) filter.serviceType = req.query.serviceType;
  res.json(await MenuItem.find(filter).sort({ category: 1, name: 1 }));
});

router.post("/menu", async (req, res) => {
  const serviceType = clean(req.body.serviceType, 20).toLowerCase();
  if (!validTypes.has(serviceType)) return res.status(400).json({ error: "Type de service invalide" });
  const item = await MenuItem.create({ vendor: vendorId(req), serviceType, name: clean(req.body.name, 120), description: clean(req.body.description, 1000), category: clean(req.body.category, 80), photoUrl: clean(req.body.photoUrl, 2000), price: Number(req.body.price), modifiers: Array.isArray(req.body.modifiers) ? req.body.modifiers.slice(0, 30).map((m) => ({ name: clean(m.name, 80), priceDelta: Number(m.priceDelta) })) : [] });
  res.status(201).json(item);
});

router.patch("/menu/:id", async (req, res) => {
  const update = {};
  for (const key of ["name", "description", "category", "photoUrl"]) if (req.body[key] !== undefined) update[key] = clean(req.body[key], key === "photoUrl" ? 2000 : key === "description" ? 1000 : key === "name" ? 120 : 80);
  if (req.body.price !== undefined) update.price = Number(req.body.price);
  if (req.body.modifiers !== undefined) update.modifiers = Array.isArray(req.body.modifiers) ? req.body.modifiers.slice(0, 30).map((m) => ({ name: clean(m.name, 80), priceDelta: Number(m.priceDelta) })) : [];
  if (req.body.isAvailable !== undefined) update.isAvailable = Boolean(req.body.isAvailable);
  const item = await MenuItem.findOneAndUpdate({ _id: req.params.id, vendor: vendorId(req) }, { $set: update }, { returnDocument: "after", runValidators: true });
  if (!item) return res.status(404).json({ error: "Article introuvable" });
  res.json(item);
});

router.delete("/menu/:id", async (req, res) => {
  const result = await MenuItem.deleteOne({ _id: req.params.id, vendor: vendorId(req) });
  if (!result.deletedCount) return res.status(404).json({ error: "Article introuvable" });
  res.status(204).end();
});

router.patch("/menu/bulk-availability", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 100) : [];
  if (!ids.length || typeof req.body.isAvailable !== "boolean") return res.status(400).json({ error: "ids et isAvailable sont requis" });
  const result = await MenuItem.updateMany({ _id: { $in: ids }, vendor: vendorId(req) }, { $set: { isAvailable: req.body.isAvailable } });
  res.json({ modifiedCount: result.modifiedCount });
});

router.get("/settings", async (req, res) => {
  const settings = await VendorSettings.findOneAndUpdate({ vendor: vendorId(req) }, { $setOnInsert: { vendor: vendorId(req) } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const hours = {};
  for (const day of dayNames) if (req.body.hours?.[day]) hours[`hours.${day}`] = req.body.hours[day];
  const settings = await VendorSettings.findOneAndUpdate({ vendor: vendorId(req) }, { $set: { ...hours, temporarilyClosed: Boolean(req.body.temporarilyClosed) }, $setOnInsert: { vendor: vendorId(req) } }, { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true });
  res.json(settings);
});

router.get("/analytics", async (req, res) => {
  const id = new mongoose.Types.ObjectId(vendorId(req));
  const end = req.query.to ? new Date(req.query.to) : new Date();
  const start = req.query.from ? new Date(req.query.from) : new Date(end.getTime() - 30 * 86400000);
  const [summary, topItems, breakdown] = await Promise.all([
    Order.aggregate([{ $match: { vendor: id, status: "livree", createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, salesTotal: { $sum: "$itemsTotal" }, orderCount: { $sum: 1 }, averageOrderValue: { $avg: "$itemsTotal" } } }]),
    Order.aggregate([{ $match: { vendor: id, status: "livree", createdAt: { $gte: start, $lt: end } } }, { $unwind: "$items" }, { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, sales: { $sum: { $multiply: ["$items.quantity", "$items.unitPrice"] } } } }, { $sort: { quantity: -1 } }, { $limit: 10 }]),
    Order.aggregate([{ $match: { vendor: id, status: "livree", createdAt: { $gte: start, $lt: end } } }, { $facet: {
      daily: [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, salesTotal: { $sum: "$itemsTotal" }, orderCount: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      weekly: [{ $group: { _id: { year: { $isoWeekYear: "$createdAt" }, week: { $isoWeek: "$createdAt" } }, salesTotal: { $sum: "$itemsTotal" }, orderCount: { $sum: 1 } } }, { $sort: { "_id.year": 1, "_id.week": 1 } }],
      monthly: [{ $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, salesTotal: { $sum: "$itemsTotal" }, orderCount: { $sum: 1 } } }, { $sort: { _id: 1 } }],
    } }]),
  ]);
  res.json({ period: { start, end }, summary: summary[0] || { salesTotal: 0, orderCount: 0, averageOrderValue: 0 }, breakdown: breakdown[0] || { daily: [], weekly: [], monthly: [] }, topItems });
});

router.get("/reconciliation", async (req, res) => {
  const result = await Order.aggregate([{ $match: { vendor: new mongoose.Types.ObjectId(vendorId(req)), paymentMethod: "especes", status: "livree" } }, { $group: { _id: null, pendingCash: { $sum: "$itemsTotal" }, orderCount: { $sum: 1 } } }]);
  res.json(result[0] || { pendingCash: 0, orderCount: 0 });
});

module.exports = router;
