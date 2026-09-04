const CACHE = "velto-shell-v12";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/liquid-glass.css",
  "/liquid-glass-v2.css",
  "/script.js",
  "/tracking.js",
  "/dashboard2.js",
  "/driver-actions-fix.js",
  "/driver-map.js",
  "/services.js",
  "/client-enhancements.js",
  "/payment.js",
  "/realtime.js",
  "/taxi-dashboard.js",
  "/realtime-offers.js",
  "/client-live-map.js",
  "/taxi-client.js",
  "/ratings.js",
  "/admin-dashboard.js",
  "/pwa.js",
  "/liquid-glass-interaction.js",
  "/social-auth.js",
  "/runtime-guard.js",
  "/service-ux-v1.js",
  "/order-tracking-enhancements.js",
  "/driver-active-ux.js",
  "/manifest.webmanifest",
  "/icon.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
