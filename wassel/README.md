# Velto — Tout. Livré.

Velto is a delivery platform covering colis, food, taxi, shop and market services.

## Architecture
- Frontend: static PWA in `wassel/`, deployed through Vercel.
- Backend: Express + Mongoose in `wassel-backend/`, deployed through Render.
- Database: MongoDB Atlas.

## Production checks
- Backend health: `/health` must return HTTP 200 with `ok: true` when MongoDB is connected.
- Authentication uses JWT tokens stored by the frontend.
- Driver dispatch requires an online, available driver with a recent GPS location and matching service capability.
- Dispatch offers expire automatically after a short TTL and are redispatched by the backend worker.

## Services
- Colis: pickup/dropoff delivery with payment selection.
- Food: restaurant selection, catalog/cart, checkout and delivery fee.
- Taxi: client booking plus driver dashboard and live GPS.
- Shop / Market: service request flows with calculated delivery fee.

## Deployment
The `master` branch is the deployment source. Keep frontend and backend changes backward-compatible and verify Render logs after backend changes.
