(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  window.VELTO_API_URL = isLocal
    ? "http://localhost:3000"
    : "https://wassel-backend-ds3n.onrender.com";
  window.VELTO_LOCALE = navigator.language || "en-US";
  const region = (window.VELTO_LOCALE.split("-")[1] || "US").toUpperCase();
  const currencies = { TN: "TND", DZ: "DZD", MA: "MAD", EG: "EGP", NG: "NGN", ZA: "ZAR", GB: "GBP", CH: "CHF", CA: "CAD", AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", IN: "INR", TR: "TRY", AE: "AED", SA: "SAR", BR: "BRL", MX: "MXN", PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK" };
  window.VELTO_CURRENCY = currencies[region] || "USD";
  window.VELTO_MONEY = (value, currency = "USD") => {
    try {
      return new Intl.NumberFormat(window.VELTO_LOCALE, { style: "currency", currency }).format(Number(value) || 0);
    } catch {
      return `${Number(value || 0).toFixed(2)} ${currency}`;
    }
  };
})();
