require("./realtimeBootstrap");

const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");

const BATCH_SIZE = 1;
const MAX_TOTAL_OFFERS = 32;
const RADIUS_KM = Math.max(0.5, Number(process.env.DISPATCH_RADIUS_KM || 3));
const OFFER_TTL_MS = 90 * 1000;
const GPS_MAX_AGE_MS = 2 * 60 * 1000;
const TICK_MS = 5000;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function validLocation(location) {
  return location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng));
}

function driverMatchesService(driver, serviceType) {
  if (serviceType === "taxi") return driver.role === "taxi";
  if (driver.role !== "livreur") return false;
  return !Array.isArray(driver.capabilities) || driver.capabilities.length === 0 || driver.capabilities.includes(serviceType);
}

async function cleanupDriverOffers() {
  const [unavailableDrivers, activeOrders] = await Promise.all([
    User.find({ role: { $in: ["livreur", "taxi"] }, $or: [{ isOnline: false }, { isAvailable: false }] }).select("_id").lean(),
    Order.find({ status: { $in: ["acceptee", "route"] }, livreur: { $ne: null } }).select("livreur").lean(),
  ]);
  const blockedDriverIds = [...new Set([
    ...unavailableDrivers.map((driver) => String(driver._id)),
    ...activeOrders.map((order) => String(order.livreur)),
  ])];
  if (!blockedDriverIds.length) return;
  await Order.updateMany(
    { status: "nouvelle", "dispatchOffers.status": "offered", "dispatchOffers.driver": { $in: blockedDriverIds } },
    { $set: { "dispatchOffers.$[offer].status": "cancelled", "dispatchOffers.$[offer].respondedAt": new Date() } },
    { arrayFilters: [{ "offer.status": "offered", "offer.driver": { $in: blockedDriverIds } }] },
  );
}

async function redispatchOrder(order) {
  const now = new Date();
  if (order.livreur || order.status !== "nouvelle") return false;
  if (order.paymentMethod !== "especes" && order.paymentStatus !== "paid") return false;
  if (order.dispatchOffers?.some((offer) => offer.status === "offered" && new Date(offer.expiresAt) > now)) return false;

  const previousDriverIds = new Set((order.dispatchOffers || []).map((offer) => String(offer.driver)));
  const totalOffers = (order.dispatchOffers || []).length;
  if (totalOffers >= MAX_TOTAL_OFFERS || !validLocation(order.pickupLocation)) return false;

  const staleCutoff = new Date(Date.now() - GPS_MAX_AGE_MS);
  const roleFilter = order.serviceType === "taxi" ? "taxi" : "livreur";
  const driverQuery = {
    role: roleFilter,
    isOnline: true,
    isAvailable: true,
    "location.lat": { $exists: true },
    "location.lng": { $exists: true },
    "location.updatedAt": { $gte: staleCutoff },
    locationPoint: { $near: { $geometry: { type: "Point", coordinates: [Number(order.pickupLocation.lng), Number(order.pickupLocation.lat)] }, $maxDistance: RADIUS_KM * 1000 } },
  };
  if (roleFilter === "livreur") {
    driverQuery.$or = [
      { capabilities: order.serviceType },
      { capabilities: { $exists: false } },
      { capabilities: { $size: 0 } },
    ];
  }

  const drivers = await User.find({ ...driverQuery, $expr: { $lt: [{ $ifNull: ["$currentOrderCount", 0] }, { $ifNull: ["$maxConcurrentOrders", 1] }] } }).select("location capabilities role ratingAverage lastAssignedAt currentOrderCount maxConcurrentOrders").limit(100);
  const ranked = drivers.filter((driver) => driverMatchesService(driver, order.serviceType) && !previousDriverIds.has(String(driver._id)))
    .map((driver) => {
      const distanceKm = haversineKm(driver.location, order.pickupLocation);
      const idleMinutes = driver.lastAssignedAt ? Math.max(0, (Date.now() - new Date(driver.lastAssignedAt).getTime()) / 60000) : 60;
      const score = (distanceKm / RADIUS_KM) * 0.55 + ((5 - Number(driver.ratingAverage || 5)) / 5) * 0.25 + (1 / (1 + idleMinutes)) * 0.2;
      return { driver, distanceKm, score };
    })
    .filter((item) => item.distanceKm <= RADIUS_KM).sort((a, b) => a.score - b.score)
    .slice(0, Math.min(BATCH_SIZE, MAX_TOTAL_OFFERS - totalOffers));
  if (!ranked.length) {
    const fallbackQuery = { role: roleFilter, isOnline: true, isAvailable: true, $expr: { $lt: [{ $ifNull: ["$currentOrderCount", 0] }, { $ifNull: ["$maxConcurrentOrders", 1] }] } };
    if (roleFilter === "livreur") fallbackQuery.$or = [{ capabilities: order.serviceType }, { capabilities: { $exists: false } }, { capabilities: { $size: 0 } }];
    const fallbackDrivers = await User.find(fallbackQuery).select("location capabilities role").limit(100);
    ranked.push(...fallbackDrivers.filter((driver) => driverMatchesService(driver, order.serviceType) && !previousDriverIds.has(String(driver._id))).map((driver) => ({ driver, distanceKm: null })).slice(0, Math.min(BATCH_SIZE, MAX_TOTAL_OFFERS - totalOffers)));
  }

  if (!ranked.length) return false;
  const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  const offers = ranked.map((item) => ({ driver: item.driver._id, distanceToPickupKm: item.distanceKm == null ? null : Math.round(item.distanceKm * 100) / 100, offeredAt: now, expiresAt, status: "offered" }));

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "nouvelle", livreur: null, dispatchOffers: { $not: { $elemMatch: { status: "offered", expiresAt: { $gt: now } } } } },
    { $push: { dispatchOffers: { $each: offers } } }, { returnDocument: "after" }
  );
  return Boolean(updated);
}

let tickInFlight = false;
let stopping = false;

async function processRedispatch() {
  if (tickInFlight || stopping || mongoose.connection.readyState !== 1) return;
  tickInFlight = true;
  try {
    await cleanupDriverOffers();
    const orders = await Order.find({
      status: "nouvelle",
      livreur: null,
        $and: [{ $or: [{ vendor: null }, { vendor: { $exists: false } }, { vendorStatus: "accepted" }] }],
      $or: [{ paymentMethod: "especes" }, { paymentMethod: { $in: ["carte", "wallet"] }, paymentStatus: "paid" }],
    }).sort({ createdAt: 1 }).limit(100);
    for (const order of orders) {
      if (stopping || mongoose.connection.readyState !== 1) break;
      try {
        await redispatchOrder(order);
      } catch (error) {
        if (!stopping && mongoose.connection.readyState === 1) console.error("Dispatch redispatch error:", error.message);
      }
    }
  } catch (error) {
    if (!stopping && mongoose.connection.readyState === 1) console.error("Dispatch queue error:", error.message);
  } finally {
    tickInFlight = false;
  }
}

let timer = null;
function startTimer() {
  if (timer || stopping) return;
  timer = setInterval(() => {
    if (!stopping) processRedispatch();
  }, TICK_MS);
  timer.unref();
}
function stopTimer() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
startTimer();
mongoose.connection.on("disconnected", stopTimer);
mongoose.connection.on("connected", startTimer);

async function stopDispatchWorker() {
  if (stopping) return;
  stopping = true;
  stopTimer();
}

process.once("SIGTERM", stopDispatchWorker);
process.once("SIGINT", stopDispatchWorker);

console.log("Dispatch redispatch worker actif");
