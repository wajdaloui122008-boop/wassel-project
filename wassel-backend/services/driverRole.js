function requireDriver(req, res, next) {
  if (!req.user || !["livreur", "taxi"].includes(req.user.role)) {
    return res.status(403).json({ error: "Accès réservé aux chauffeurs" });
  }
  return next();
}

module.exports = { requireDriver };
