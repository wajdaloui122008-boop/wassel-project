const MockProvider = require("./MockProvider");
const StripeProvider = require("./StripeProvider");

let stripeProvider;

function getPaymentProvider(name = process.env.PAYMENT_PROVIDER || "mock") {
  const normalized = String(name).trim().toLowerCase();
  if (normalized === "mock") return new MockProvider();
  if (normalized === "stripe") {
    if (!stripeProvider) stripeProvider = new StripeProvider();
    return stripeProvider;
  }
  throw new Error(`Unsupported payment provider: ${normalized}`);
}

const CURRENCY_EXPONENTS = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0
};

function normalizeCurrency(value) {
  const currency = String(value || process.env.DEFAULT_CURRENCY || "TND").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  return currency;
}

function toMinorUnits(amount, currency) {
  const exponent = CURRENCY_EXPONENTS[normalizeCurrency(currency)] ?? 2;
  const factor = 10 ** exponent;
  return Math.round(Number(amount) * factor);
}

module.exports = { getPaymentProvider, normalizeCurrency, toMinorUnits, CURRENCY_EXPONENTS };
