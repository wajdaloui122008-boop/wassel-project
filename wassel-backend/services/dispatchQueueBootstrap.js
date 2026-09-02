require("./realtimeBootstrap");

const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");

const BATCH_SIZE = 8;
const MAX_TOTAL_OFFERS = 32;
const RADIUS_KM = 20;
const OFFER_TTL_MS = 30 * 1000;
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

async function redispatchOrder(order) {
  const now = new Date();
  if (order.livreur || order.status !== "nouvelle") return false;
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
  };
  if (roleFilter === "livreur") {
    driverQuery.$or = [
      { capabilities: order.serviceType },
      { capabilities: { $exists: false } },
      { capabilities: { $size: 0 } },
    ];
  }

  const drivers = await User.find(driverQuery).select("location capabilities role").limit(100);
  const ranked = drivers.filter((driver) => driverMatchesService(driver, order.serviceType) && !previousDriverIds.has(String(driver._id)))
    .map((driver) => ({ driver, distanceKm: haversineKm(driver.location, order.pickupLocation) }))
    .filter((item) => item.distanceKm <= RADIUS_KM).sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.min(BATCH_SIZE, MAX_TOTAL_OFFERS - totalOffers));

  if (!ranked.length) return false;
  const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  const offers = ranked.map((item) => ({ driver: item.driver._id, distanceToPickupKm: Math.round(item.distanceKm * 100) / 100, offeredAt: now, expiresAt, status: "offered" }));

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "nouvelle", livreur: null, dispatchOffers: { $not: { $elemMatch: { status: "offered", expiresAt: { $gt: now } } } } },
    { $push: { dispatchOffers: { $each: offers } } }, { new: true }
  );
  return Boolean(updated);
}

async function processRedispatch() {
  if (mongoose.connection.readyState !== 1) return;
  const orders = await Order.find({ status: "nouvelle", livreur: null }).sort({ createdAt: 1 }).limit(100);
  for (const order of orders) {
    try { await redispatchOrder(order); } catch (error) { console.error("Dispatch redispatch error:", error.message); }
  }
}

let stopping = false;
const timer = setInterval(() => {
  if (!stopping) processRedispatch().catch((error) => console.error("Dispatch queue error:", error.message));
}, TICK_MS);
timer.unref();

async function stopDispatchWorker() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
}

process.once("SIGTERM", stopDispatchWorker);
process.once("SIGINT", stopDispatchWorker);

console.log("Dispatch redispatch worker actif");
