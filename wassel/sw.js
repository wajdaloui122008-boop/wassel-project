const CACHE = "velto-shell-v10";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/tracking.js",
  "/dashboard2.js",
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
  "/manifest.webmanifest"
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
