const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization; // expected format: "Bearer <token>"
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const token = header.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide, reconnectez-vous" });
  }
}

// Restricts a route to a specific role (e.g. only livreurs can accept orders)
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Accès non autorisé pour ce rôle" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };