const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const { notifyUser } = require("./notificationService");
const { JWT_SECRET } = require("../middleware/auth");

if (!http.Server.prototype.__veltoRealtimePatched) {
  http.Server.prototype.__veltoRealtimePatched = true;
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function veltoListen(...args) {
    attachRealtime(this);
    return originalListen.apply(this, args);
  };
}

function attachRealtime(server) {
  if (server.__veltoRealtimeAttached) return;
  server.__veltoRealtimeAttached = true;

  const io = new Server(server, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || "https://wassel-project.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
        .split(",").map((v) => v.trim()).filter(Boolean),
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  global.__veltoIO = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("Authentification requise"));
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch (_) {
      next(new Error("Session invalide"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.user?.id || "");
    if (userId) socket.join(`user:${userId}`);
    if (socket.user?.role === "livreur" || socket.user?.role === "taxi") {
      const pendingDisconnect = driverDisconnectTimers.get(userId);
      if (pendingDisconnect) {
        clearTimeout(pendingDisconnect);
        driverDisconnectTimers.delete(userId);
      }
    }

    socket.on("order:watch", async (orderId) => {
      if (typeof orderId !== "string" || !mongoose.isValidObjectId(orderId)) return;
      try {
        const order = await Order.findById(orderId)
          .select("client livreur status serviceType pickupLocation dropoffLocation distanceKm estimatedDurationMin currency paymentStatus statusHistory")
          .populate("livreur", "name location isOnline isAvailable");
        if (!order) return;
        if (String(order.client || "") !== userId && String(order.livreur?._id || order.livreur || "") !== userId && socket.user?.role !== "admin") return;
        socket.join(`order:${orderId}`);
        socket.emit("order:snapshot", buildSnapshot(order));
      } catch (err) {
        console.error("Realtime watch error:", err.message);
      }
    });

    socket.on("order:unwatch", (orderId) => {
      if (typeof orderId === "string") socket.leave(`order:${orderId}`);
    });

    socket.on("driver:location", async (payload = {}) => {
      if (socket.user?.role !== "livreur" && socket.user?.role !== "taxi") return;
      if (mongoose.connection.readyState !== 1 || typeof payload.orderId !== "string" || !mongoose.isValidObjectId(payload.orderId)) return;
      const lat = Number(payload.lat), lng = Number(payload.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      try {
        const order = await Order.findOne({ _id: payload.orderId, livreur: userId, status: { $in: ["acceptee", "route"] } }).select("_id client status");
        if (!order || mongoose.connection.readyState !== 1) return;
        const location = { lat, lng, updatedAt: new Date(), ...(Number.isFinite(Number(payload.heading)) ? { heading: Number(payload.heading) } : {}), ...(Number.isFinite(Number(payload.speed)) ? { speed: Math.max(0, Number(payload.speed)) } : {}) };
        await User.updateOne({ _id: userId }, { $set: { location, locationPoint: { type: "Point", coordinates: [lng, lat] } } });
        io.to(`order:${String(order._id)}`).emit("driver:location", { orderId: String(order._id), location });
      } catch (err) {
        if (!shuttingDown && mongoose.connection.readyState === 1) console.error("Realtime location error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      if (socket.user?.role !== "livreur" && socket.user?.role !== "taxi") return;
      const driverId = userId;
      const timer = setTimeout(async () => {
        driverDisconnectTimers.delete(driverId);
        if (shuttingDown || mongoose.connection.readyState !== 1 || io.sockets.adapter.rooms.has(`user:${driverId}`)) return;
        try {
          await User.updateOne({ _id: driverId }, { $set: { isOnline: false, isAvailable: false } });
        } catch (err) {
          if (!shuttingDown && mongoose.connection.readyState === 1) console.error("Driver reconnect grace error:", err.message);
        }
      }, DRIVER_RECONNECT_GRACE_MS);
      timer.unref();
      driverDisconnectTimers.set(driverId, timer);
    });
  });

  const lastSnapshots = new Map();
  const sentOffers = new Map();
  const sentVendorOrders = new Map();
  const driverDisconnectTimers = new Map();
  const DRIVER_RECONNECT_GRACE_MS = 75 * 1000;
  let shuttingDown = false;

  const tick = async () => {
    if (shuttingDown || mongoose.connection.readyState !== 1) return;
    try {
      const now = Date.now();
      const recentTerminalCutoff = new Date(now - 15000);
      const active = await Order.find({
        $or: [
          { status: { $in: ["acceptee", "route"] }, livreur: { $ne: null } },
          { status: { $in: ["livree", "annulee"] }, updatedAt: { $gte: recentTerminalCutoff } },
        ],
      })
        .select("client livreur status serviceType pickupLocation dropoffLocation distanceKm estimatedDurationMin currency paymentStatus statusHistory updatedAt")
        .populate("livreur", "name location isOnline isAvailable")
        .lean();

      if (shuttingDown || mongoose.connection.readyState !== 1) return;

      for (const order of active) {
        const snapshot = buildSnapshot(order);
        const key = String(order._id);
        const serialized = JSON.stringify(snapshot);
        if (lastSnapshots.get(key) !== serialized) {
          lastSnapshots.set(key, serialized);
          io.to(`order:${key}`).emit("order:update", snapshot);
        }

      }

      const offerOrders = await Order.find({
        status: "nouvelle",
        "dispatchOffers.status": "offered",
        "dispatchOffers.expiresAt": { $gt: new Date() },
        "dispatchOffers.offeredAt": { $gte: new Date(now - 10000) }
      }).select("id serviceType pickup dropoff pkg fee currency dispatchOffers").lean();

      if (shuttingDown || mongoose.connection.readyState !== 1) return;

      for (const order of offerOrders) {
        for (const offer of order.dispatchOffers || []) {
          if (offer.status !== "offered" || new Date(offer.expiresAt).getTime() <= now) continue;
          const offerKey = `${String(order._id)}:${String(offer.driver)}:${new Date(offer.offeredAt).getTime()}`;
          if (sentOffers.has(offerKey)) continue;
          sentOffers.set(offerKey, now);
          const offerPayload = {
            order: {
              id: String(order._id),
              serviceType: order.serviceType,
              pickup: order.pickup,
              dropoff: order.dropoff,
              pkg: order.pkg,
              fee: order.fee,
              currency: order.currency,
            },
            offer: {
              distanceToPickupKm: offer.distanceToPickupKm,
              offeredAt: offer.offeredAt,
              expiresAt: offer.expiresAt,
            }
          };
          io.to(`user:${String(offer.driver)}`).emit("driver:offer", offerPayload);
          await notifyUser({
            recipient: offer.driver,
            type: "dispatch-offer",
            orderId: order._id,
            title: "Nouvelle course",
            body: `${order.pickup || "Départ"} → ${order.dropoff || "Destination"}`,
            idempotencyKey: `dispatch-offer:${order._id}:${offer.driver}:${new Date(offer.offeredAt).getTime()}`,
          });
        }
      }

      for (const [key, at] of sentOffers) if (now - at > 60000) sentOffers.delete(key);
      for (const key of lastSnapshots.keys()) {
        if (!active.some((order) => String(order._id) === key)) lastSnapshots.delete(key);
      }
    } catch (err) {
      if (!shuttingDown && mongoose.connection.readyState !== 0) console.error("Realtime tick error:", err.message);
    }
  };

  const vendorTick = async () => {
    if (shuttingDown || mongoose.connection.readyState !== 1) return;
    try {
      const now = Date.now();
      const pendingVendorOrders = await Order.find({ status: "nouvelle", vendorStatus: "pending", vendor: { $ne: null } })
        .select("client vendor serviceType pickup dropoff pkg items fee currency createdAt")
        .lean();

      if (shuttingDown || mongoose.connection.readyState !== 1) return;

      for (const order of pendingVendorOrders) {
        const key = String(order._id);
        if (sentVendorOrders.has(key)) continue;
        sentVendorOrders.set(key, now);
        io.to(`user:${String(order.vendor)}`).emit("vendor:order", { ...order, id: key });
      }
      for (const [key, at] of sentVendorOrders) if (now - at > 60000) sentVendorOrders.delete(key);
    } catch (err) {
      if (!shuttingDown && mongoose.connection.readyState !== 0) console.error("Realtime vendor tick error:", err.message);
    }
  };

  let timer = null;
  let vendorTimer = null;
  const startTimer = () => {
    if (timer || shuttingDown) return;
    timer = setInterval(tick, 1500);
    timer.unref();
    vendorTimer = setInterval(vendorTick, 1500);
    vendorTimer.unref();
  };
  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (vendorTimer) {
      clearInterval(vendorTimer);
      vendorTimer = null;
    }
  };
  startTimer();
  mongoose.connection.on("disconnected", stopTimer);
  mongoose.connection.on("connected", startTimer);
  server.once("close", () => {
    shuttingDown = true;
    stopTimer();
    mongoose.connection.off("disconnected", stopTimer);
    mongoose.connection.off("connected", startTimer);
    io.close();
    lastSnapshots.clear();
    sentOffers.clear();
    sentVendorOrders.clear();
    for (const timer of driverDisconnectTimers.values()) clearTimeout(timer);
    driverDisconnectTimers.clear();
  });
  console.log("Velto realtime gateway actif");
}

function buildSnapshot(order) {
  const livreur = order.livreur && typeof order.livreur === "object" ? order.livreur : null;
  return {
    orderId: String(order._id),
    status: order.status,
    serviceType: order.serviceType,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    pickupLocation: order.pickupLocation || null,
    dropoffLocation: order.dropoffLocation || null,
    distanceKm: order.distanceKm ?? null,
    estimatedDurationMin: order.estimatedDurationMin ?? null,
    statusHistory: order.statusHistory || [],
    driver: livreur ? {
      id: String(livreur._id),
      name: livreur.name,
      location: livreur.location || null,
      isOnline: Boolean(livreur.isOnline),
      isAvailable: Boolean(livreur.isAvailable),
    } : null,
  };
}
