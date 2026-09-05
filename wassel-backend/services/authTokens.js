const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

function signAccessToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL, algorithm: "HS256" },
  );
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setRefreshCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Lax";
  res.setHeader("Set-Cookie", `refresh_token=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/auth; Max-Age=${Math.floor(REFRESH_TOKEN_TTL_MS / 1000)}${secure}`);
}

function clearRefreshCookie(res) {
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Lax";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `refresh_token=; HttpOnly; SameSite=${sameSite}; Path=/auth; Max-Age=0${secure}`);
}

async function issueAuthPair(user) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { token: signAccessToken(user), refreshToken, user };
}

async function rotateRefreshToken(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    throw Object.assign(new Error("Refresh token invalide"), { status: 401 });
  }

  const tokenHash = hashRefreshToken(rawToken);
  const stored = await RefreshToken.findOne({ tokenHash }).populate("userId");
  if (!stored) throw Object.assign(new Error("Refresh token invalide"), { status: 401 });

  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { userId: stored.userId._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw Object.assign(new Error("Refresh token réutilisé; reconnexion requise"), { status: 401 });
  }
  const now = new Date();
  if (stored.expiresAt <= now) {
    throw Object.assign(new Error("Refresh token expiré"), { status: 401 });
  }

  const revoked = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { returnDocument: "after" },
  );
  if (!revoked) {
    await RefreshToken.updateMany(
      { userId: stored.userId._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw Object.assign(new Error("Refresh token réutilisé; reconnexion requise"), { status: 401 });
  }
  return issueAuthPair(stored.userId);
}

async function revokeRefreshToken(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) return false;
  const result = await RefreshToken.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

module.exports = {
  issueAuthPair,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  setRefreshCookie,
  clearRefreshCookie,
};
