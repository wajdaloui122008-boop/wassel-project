const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;
const MAX_TOKEN_LENGTH = 4096;

if (isProduction && !JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in production");
}

const effectiveSecret = JWT_SECRET || "dev-only-secret-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const token = header.slice(7).trim();
  if (!token || token.length > MAX_TOKEN_LENGTH || token.split(".").length !== 3) {
    return res.status(401).json({ error: "Session invalide, reconnectez-vous" });
  }

  try {
    req.user = jwt.verify(token, effectiveSecret, { algorithms: ["HS256"] });
    if (!req.user?.id || !req.user?.role) {
      return res.status(401).json({ error: "Session invalide, reconnectez-vous" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide, reconnectez-vous" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && !(role === "livreur" && req.user.role === "taxi")) {
      return res.status(403).json({ error: "Accès non autorisé pour ce rôle" });
    }
    next();
  };
}

function requireVendor(req, res, next) {
  if (req.user.role !== "vendor" && req.user.role !== "admin") return res.status(403).json({ error: "Accès réservé aux vendeurs" });
  next();
}

module.exports = { requireAuth, requireRole, requireVendor, JWT_SECRET: effectiveSecret };