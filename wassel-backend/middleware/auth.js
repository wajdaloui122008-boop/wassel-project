const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;

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
  if (!token) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  try {
    req.user = jwt.verify(token, effectiveSecret);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide, reconnectez-vous" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Accès non autorisé pour ce rôle" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET: effectiveSecret };