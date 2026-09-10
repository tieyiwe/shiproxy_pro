const { sql } = require('../db');

function loadUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    req.user = null;
    res.locals.currentUser = null;
    return next();
  }
  sql`SELECT id, name, email FROM users WHERE id = ${req.session.userId}`
    .then((rows) => {
      req.user = rows[0] || null;
      res.locals.currentUser = req.user;
      next();
    })
    .catch(next);
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

module.exports = { loadUser, requireAuth };
