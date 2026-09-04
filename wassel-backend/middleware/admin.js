function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Accès administrateur requis" });
  next();
}

module.exports = { requireAdmin };
