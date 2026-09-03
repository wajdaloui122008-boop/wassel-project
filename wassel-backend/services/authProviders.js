const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const originalExpress = express;
const router = originalExpress.Router();
router.use(originalExpress.json({ limit: "8kb" }));
const states = new Map();
const otpAttempts = new Map();
const jwksCache = new Map();

function UserModel() { return require("../models/User"); }
function clean(value, max = 160) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function signToken(user) { return jwt.sign({ id: user._id.toString(), role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" }); }
function baseUrl() { return (process.env.AUTH_PUBLIC_URL || "https://wassel-project.vercel.app").replace(/\/$/, ""); }
function makeState(data) { const state = crypto.randomBytes(24).toString("hex"); states.set(state, { ...data, createdAt: Date.now() }); return state; }
function takeState(state) { const item = states.get(state); states.delete(state); if (!item || Date.now() - item.createdAt > 10 * 60 * 1000) return null; return item; }
function redirectWithResult(res, result) { const params = new URLSearchParams(result); return res.redirect(`${baseUrl()}/?auth=${params.toString()}`); }
function roleFrom(value) { return ["client", "livreur", "taxi"].includes(value) ? value : "client"; }
function b64urlToBuffer(value) { return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4), "base64"); }
function decodeJwt(token) { const parts = String(token || "").split("."); if (parts.length !== 3) throw new Error("JWT invalide"); return { header: JSON.parse(b64urlToBuffer(parts[0]).toString("utf8")), payload: JSON.parse(b64urlToBuffer(parts[1]).toString("utf8")), signingInput: `${parts[0]}.${parts[1]}`, signature: b64urlToBuffer(parts[2]) }; }
async function fetchJwks(url, cacheKey) { const cached = jwksCache.get(cacheKey); if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.keys; const response = await fetch(url); if (!response.ok) throw new Error("Impossible de récupérer les clés d'authentification"); const data = await response.json(); jwksCache.set(cacheKey, { at: Date.now(), keys: data.keys || [] }); return data.keys || []; }
async function verifyEs256Jwt(token, { jwksUrl, cacheKey, issuer, audience }) {
  const decoded = decodeJwt(token); if (decoded.header.alg !== "ES256" || !decoded.header.kid) throw new Error("Algorithme JWT invalide");
  const key = (await fetchJwks(jwksUrl, cacheKey)).find((item) => item.kid === decoded.header.kid); if (!key) throw new Error("Clé JWT inconnue");
  const publicKey = crypto.createPublicKey({ key, format: "jwk" });
  const valid = crypto.verify("sha256", Buffer.from(decoded.signingInput), publicKey, decoded.signature); if (!valid) throw new Error("Signature JWT invalide");
  const now = Math.floor(Date.now() / 1000), p = decoded.payload;
  if (p.iss !== issuer || p.aud !== audience || !p.sub || !p.exp || p.exp <= now) throw new Error("Claims JWT invalides");
  return p;
}
async function findOrCreate({ email, name, role, phone }) {
  const User = UserModel(); const normalizedEmail = clean(email).toLowerCase();
  if (!normalizedEmail) throw new Error("Le fournisseur n'a pas fourni d'email exploitable");
  let user = await User.findOne({ email: normalizedEmail });
  if (!user) { const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12); user = await User.create({ name: clean(name, 80) || "Utilisateur Velto", email: normalizedEmail, password: randomPassword, role: roleFrom(role), country: "TN", phone: clean(phone, 30) }); }
  return { token: signToken(user), user };
}

router.get("/google", (req, res) => {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID, 300); if (!clientId) return res.status(503).json({ error: "Google Sign-In n'est pas configuré sur le serveur." });
  const state = makeState({ role: roleFrom(req.query.role) }); const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", `${baseUrl()}/auth/google/callback`); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "openid email profile"); url.searchParams.set("state", state); res.redirect(url.toString());
});
router.get("/google/callback", async (req, res) => {
  try {
    const state = takeState(req.query.state); if (!state) return redirectWithResult(res, { error: "Session Google invalide ou expirée" });
    const code = clean(req.query.code, 2000), clientId = clean(process.env.GOOGLE_CLIENT_ID, 300), clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET, 500); if (!code || !clientId || !clientSecret) return redirectWithResult(res, { error: "Configuration Google incomplète" });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${baseUrl()}/auth/google/callback`, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json(); if (!tokenResponse.ok || !tokens.id_token) throw new Error("Échange du code Google refusé");
    const tokenInfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`); const info = await tokenInfo.json(); if (!tokenInfo.ok || info.aud !== clientId || info.iss !== "https://accounts.google.com" || !info.sub) throw new Error("Identité Google invalide");
    const result = await findOrCreate({ email: info.email, name: info.name, role: state.role }); redirectWithResult(res, { token: result.token, name: result.user.name, ok: "1" });
  } catch (error) { console.error("Google auth error:", error.message); redirectWithResult(res, { error: "Connexion Google impossible" }); }
});

router.get("/apple", (req, res) => {
  const clientId = clean(process.env.APPLE_CLIENT_ID, 300); if (!clientId) return res.status(503).json({ error: "Apple Sign-In n'est pas configuré sur le serveur." });
  const state = makeState({ role: roleFrom(req.query.role) }); const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", `${baseUrl()}/auth/apple/callback`); url.searchParams.set("response_type", "code"); url.searchParams.set("response_mode", "form_post"); url.searchParams.set("scope", "name email"); url.searchParams.set("state", state); res.redirect(url.toString());
});
router.post("/apple/callback", async (req, res) => {
  try {
    const state = takeState(req.body?.state); if (!state) return redirectWithResult(res, { error: "Session Apple invalide ou expirée" });
    const code = clean(req.body?.code, 2000), clientId = clean(process.env.APPLE_CLIENT_ID, 300), clientSecret = clean(process.env.APPLE_CLIENT_SECRET, 2000); if (!code || !clientId || !clientSecret) return redirectWithResult(res, { error: "Configuration Apple incomplète" });
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${baseUrl()}/auth/apple/callback`, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json(); if (!tokenResponse.ok || !tokens.id_token) throw new Error("Échange du code Apple refusé");
    const payload = await verifyEs256Jwt(tokens.id_token, { jwksUrl: "https://appleid.apple.com/auth/keys", cacheKey: "apple", issuer: "https://appleid.apple.com", audience: clientId });
    const name = req.body?.user ? (() => { try { const u = JSON.parse(req.body.user); return `${u?.name?.firstName || ""} ${u?.name?.lastName || ""}`.trim(); } catch { return ""; } })() : "";
    const result = await findOrCreate({ email: payload.email, name, role: state.role }); redirectWithResult(res, { token: result.token, name: result.user.name, ok: "1" });
  } catch (error) { console.error("Apple auth error:", error.message); redirectWithResult(res, { error: "Connexion Apple impossible" }); }
});

router.post("/phone/request", async (req, res) => {
  const phone = clean(req.body?.phone, 30).replace(/[^+\d]/g, ""); if (!/^\+\d{8,15}$/.test(phone)) return res.status(400).json({ error: "Numéro international invalide. Exemple : +216XXXXXXXX" });
  const key = `${req.ip || "unknown"}:${phone}`, now = Date.now(), previous = otpAttempts.get(key); if (previous && now - previous.startedAt < 15 * 60 * 1000 && previous.count >= 5) return res.status(429).json({ error: "Trop de demandes de code. Réessayez plus tard." });
  otpAttempts.set(key, previous && now - previous.startedAt < 15 * 60 * 1000 ? { startedAt: previous.startedAt, count: previous.count + 1 } : { startedAt: now, count: 1 });
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return res.status(503).json({ error: "La connexion par numéro nécessite la configuration SMS du serveur." });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"); const response = await fetch(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: phone, Channel: "sms" }) });
  const data = await response.json(); if (!response.ok) return res.status(502).json({ error: "Impossible d'envoyer le code SMS." }); res.json({ ok: true, status: data.status || "pending" });
});
router.post("/phone/verify", async (req, res) => {
  const User = UserModel(); const phone = clean(req.body?.phone, 30).replace(/[^+\d]/g, ""), code = clean(req.body?.code, 10), role = roleFrom(req.body?.role); if (!/^\+\d{8,15}$/.test(phone) || !/^\d{4,8}$/.test(code)) return res.status(400).json({ error: "Numéro ou code invalide." });
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return res.status(503).json({ error: "La connexion par numéro nécessite la configuration SMS du serveur." });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"); const response = await fetch(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: phone, Code: code }) });
  const data = await response.json(); if (!response.ok || data.status !== "approved") return res.status(401).json({ error: "Code incorrect ou expiré." });
  let user = await User.findOne({ phone }); if (!user) { const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12); user = await User.create({ name: `Utilisateur ${phone.slice(-4)}`, email: `${phone.replace(/\D/g, "")}@phone.velto.local`, password: randomPassword, role, country: "TN", phone }); }
  res.json({ token: signToken(user), user });
});

const wrappedExpress = function (...args) { const app = originalExpress(...args); app.use("/auth", router); return app; };
Object.assign(wrappedExpress, originalExpress);
require.cache[require.resolve("express")].exports = wrappedExpress;
