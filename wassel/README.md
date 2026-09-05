# Velto — Tout. Livré.

Velto is a delivery platform covering colis, food, taxi, shop and market services.

## Architecture
- Frontend: static PWA in `wassel/`, deployed through Vercel.
- Backend: Express + Mongoose in `wassel-backend/`, deployed through Render.
- Database: MongoDB Atlas.

## Production checks
- Backend health: `/health` must return HTTP 200 with `ok: true` when MongoDB is connected.
- Authentication uses JWT tokens stored by the frontend.
- Driver dispatch prefers online, available drivers with a recent GPS location and matching service capability; drivers without GPS can receive fallback offers.
- Dispatch offers expire automatically and are handled by the backend dispatch worker.
- Production requires `MONGODB_URI` and `JWT_SECRET`; the API applies Helmet security headers and a bounded global rate limit.
- Dispatch uses a configurable `DISPATCH_RADIUS_KM` (3 km by default), ranks drivers by distance, rating, and idle time, and sends one offer at a time. Set `FCM_SERVER_KEY` and register a driver's push token with `PUT /drivers/me/push-token` for background offer notifications.
- Driver GPS is streamed over the authenticated Socket.IO connection during active orders, with the location REST endpoint retained as a fallback. Customer updates are isolated to the order room, and transient driver disconnects have a 75-second reconnect grace period.
- Vendor accounts use `/vendors` for real-time order decisions, menu CRUD and availability, weekly hours/temporary closure, MongoDB analytics, and cash reconciliation. Customer checkout validates vendor ownership, opening hours, and current item availability server-side.
- Notifications are stored in `/notifications` as an in-app inbox and sent transactionally through configured FCM push tokens. Transactional pushes cannot be disabled; only marketing pushes are configurable. Status notifications use an order/recipient/status idempotency key.
- `/ratings` supports post-delivery driver and vendor ratings, rolling aggregates, vendor review reads, and vendor/admin flagging. `/promos/validate` and checkout enforce promo dates, limits, minimums, vendor scope, and one redemption per order through `PromoRedemption`.
- Realtime and dispatch timers pause when MongoDB disconnects and restart after reconnection; HTTP shutdown closes the socket gateway and database cleanly.

## Services
- Colis: pickup/dropoff delivery with payment selection.
- Food: restaurant selection, catalog/cart, checkout and delivery fee.
- Taxi: client booking plus driver dashboard and live GPS.
- Shop / Market: service request flows with calculated delivery fee.

## Feature status
- Implemented MVP: email authentication, country-aware registration, map/GPS addresses, cart checkout, cash/card/wallet payments, driver offers with countdowns, capability matching, live tracking snapshots, ratings, and admin order supervision.
- Partial: social login UI, taxi navigation, vendor operations, and realtime notifications have integration points but still need production provider configuration.
- Not yet implemented: phone OTP, saved address book, promo codes, scheduled orders, favorites/reorder, in-app driver chat/calling, document verification, batching, surge/zones, and financial reconciliation.

## Deployment
The `master` branch is the deployment source. Keep frontend and backend changes backward-compatible and verify Render logs after backend changes.
