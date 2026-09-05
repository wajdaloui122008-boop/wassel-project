const crypto = require("crypto");
const PasswordResetToken = require("../models/PasswordResetToken");
const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");

const RESET_TTL_MS = 20 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendResetEmail({ email, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  if (!apiKey || !from) throw new Error("Password reset email provider is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Réinitialisation de votre mot de passe Velto",
      html: `<p>Réinitialisez votre mot de passe dans les 20 minutes.</p><p><a href="${frontendUrl}/?resetToken=${encodeURIComponent(token)}">Réinitialiser mon mot de passe</a></p>`,
    }),
  });
  if (!response.ok) throw new Error("Password reset email delivery failed");
}

async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email || "").trim().toLowerCase(), isDeleted: { $ne: true } }).select("email");
  if (!user) return;
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  await sendResetEmail({ email: user.email, token: rawToken });
}

async function resetPassword({ token, password }) {
  if (typeof token !== "string" || token.length < 32 || typeof password !== "string" || password.length < 6 || password.length > 128) {
    throw Object.assign(new Error("Token ou mot de passe invalide"), { status: 400 });
  }
  const reset = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!reset) throw Object.assign(new Error("Token invalide ou expiré"), { status: 400 });
  const bcrypt = require("bcryptjs");
  const hashedPassword = await bcrypt.hash(password, 12);
  const updated = await User.updateOne({ _id: reset.userId, isDeleted: { $ne: true } }, { $set: { password: hashedPassword } });
  if (updated.modifiedCount !== 1) throw Object.assign(new Error("Compte introuvable"), { status: 400 });
  await RefreshToken.updateMany({ userId: reset.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

module.exports = { requestPasswordReset, resetPassword };
