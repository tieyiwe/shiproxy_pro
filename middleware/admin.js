// Gates the platform-operator admin panel (routes/admin.js). Mounted after
// requireAuth there, so req.user is already guaranteed to exist by the time
// this runs - it only needs to check the is_admin flag itself.
function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin === true) return next();
  return res.status(403).render('errors/403', { title: '403' });
}

module.exports = { requireAdmin };
