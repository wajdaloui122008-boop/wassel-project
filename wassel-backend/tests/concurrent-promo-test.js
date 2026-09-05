require("dotenv").config();

const mongoose = require("mongoose");
const { redeemPromoAtomic, PromoCode, PromoRedemption } = require("../services/promoRouter");

const attempts = Number(process.env.PROMO_TEST_ATTEMPTS || 10);
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required");
}

async function main() {
  await mongoose.connect(uri);

  const suffix = `${Date.now()}-${process.pid}`;
  let promo;
  try {
    promo = await PromoCode.create({
      code: `CONCURRENT-${suffix}`.slice(0, 40),
      discountType: "fixed",
      value: 5,
      usageLimit: 1,
      perUserLimit: attempts,
      validFrom: new Date(Date.now() - 1000),
      validTo: new Date(Date.now() + 60 * 60 * 1000),
    });

    const userId = new mongoose.Types.ObjectId();
    const requests = Array.from({ length: attempts }, (_, index) =>
      redeemPromoAtomic({
        promoId: promo._id,
        userId,
        orderId: new mongoose.Types.ObjectId(),
        discountApplied: 5,
      }).then(() => ({ index, ok: true })).catch((error) => ({
        index,
        ok: false,
        code: error.code || "UNKNOWN",
        message: error.message,
      })),
    );

    const results = await Promise.all(requests);
    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const storedPromo = await PromoCode.findById(promo._id).lean();
    const redemptionCount = await PromoRedemption.countDocuments({ code: promo._id });

    console.log(JSON.stringify({
      attempts,
      succeeded: succeeded.length,
      failed: failed.length,
      storedUsedCount: storedPromo?.usedCount,
      redemptionCount,
      failures: failed,
    }, null, 2));

    if (succeeded.length !== 1 || storedPromo?.usedCount !== 1 || redemptionCount !== 1) {
      throw new Error("Atomic promo limit assertion failed");
    }
  } finally {
    if (promo) {
      await PromoRedemption.deleteMany({ code: promo._id });
      await PromoCode.deleteOne({ _id: promo._id });
    }
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
