const express = require("express");
const mongoose = require("mongoose");
const PromoCode = require("../models/PromoCode");
const PromoRedemption = require("../models/PromoRedemption");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function validatePromo({ code, userId, vendorId, orderValue, now = new Date() }) {
  const promo = await PromoCode.findOne({ code: String(code || "").trim().toUpperCase(), isActive: true, validFrom: { $lte: now }, validTo: { $gte: now } });
  if (!promo) throw Object.assign(new Error("Code promo invalide ou expiré"), { status: 400 });
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) throw Object.assign(new Error("Ce code promo a atteint sa limite"), { status: 409 });
  if (Number(orderValue) < promo.minOrderValue) throw Object.assign(new Error("Le montant minimum n'est pas atteint"), { status: 400 });
  if (promo.applicableVendors.length && (!vendorId || !promo.applicableVendors.some((id) => String(id) === String(vendorId)))) throw Object.assign(new Error("Code non valable chez ce vendeur"), { status: 400 });
  const used = await PromoRedemption.countDocuments({ code: promo._id, userId });
  if (used >= promo.perUserLimit) throw Object.assign(new Error("Vous avez déjà utilisé ce code"), { status: 409 });
  let discount = promo.discountType === "percent" ? Number(orderValue) * promo.value / 100 : promo.value;
  if (promo.maxDiscountAmount != null) discount = Math.min(discount, promo.maxDiscountAmount);
  return { promo, discount: Math.max(0, Math.min(Number(orderValue), Math.round(discount * 100) / 100)) };
}

async function redeemPromoAtomic({ promoId, userId, orderId, discountApplied, now = new Date() }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const promo = await PromoCode.findOneAndUpdate(
        {
          _id: promoId,
          isActive: true,
          validFrom: { $lte: now },
          validTo: { $gte: now },
          $or: [
            { usageLimit: null },
            { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
          ],
        },
        { $inc: { usedCount: 1 } },
        { session, returnDocument: "after" },
      );

      if (!promo) {
        throw Object.assign(new Error("La limite d'utilisation du code promo est atteinte"), {
          status: 409,
          code: "PROMO_LIMIT_REACHED",
        });
      }

      const usedCount = await PromoRedemption.countDocuments({ code: promo._id, userId }).session(session);
      if (usedCount >= promo.perUserLimit) {
        throw Object.assign(new Error("Vous avez déjà utilisé ce code"), {
          status: 409,
          code: "PROMO_USER_LIMIT_REACHED",
        });
      }

      await PromoRedemption.create([{
        code: promo._id,
        codeValue: promo.code,
        userId,
        orderId,
        discountApplied,
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}

router.post("/validate", async (req, res) => {
  try {
    const result = await validatePromo({ code: req.body.code, userId: req.user.id, vendorId: req.body.vendorId, orderValue: Number(req.body.orderValue) });
    res.json({ code: result.promo.code, discount: result.discount });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const promo = await PromoCode.create({ ...req.body, code: String(req.body.code || "").trim().toUpperCase() });
  res.status(201).json(promo);
});

module.exports = { router, validatePromo, redeemPromoAtomic, PromoCode, PromoRedemption };
