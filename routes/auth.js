const express = require('express');
const bcrypt = require('bcryptjs');
const { sql } = require('../db');
const { isValidEmail, isValidPassword } = require('../lib/validate');

const router = express.Router();

// Only allow same-site relative paths as a redirect target - a bare "/x" is
// safe, but "//evil.com" or "https://evil.com" is browser-parsed as an
// off-site absolute URL and would otherwise be an open redirect.
function safeReturnTo(value) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : null;
}

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const returnTo = safeReturnTo(req.query.returnTo);
  if (returnTo) req.session.returnTo = returnTo;
  res.render('auth/signup', { error: null, values: { name: '', email: '' } });
});

router.post('/signup', async (req, res, next) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  try {
    if (!name || !email || !password) {
      return res.status(400).render('auth/signup', {
        error: res.locals.t('auth.error_required_fields'),
        values: { name, email },
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).render('auth/signup', {
        error: res.locals.t('auth.error_invalid_credentials'),
        values: { name, email },
      });
    }
    if (!isValidPassword(password)) {
      return res.status(400).render('auth/signup', {
        error: res.locals.t('auth.error_password_length'),
        values: { name, email },
      });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).render('auth/signup', {
        error: res.locals.t('auth.error_email_taken'),
        values: { name, email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash)
      VALUES (${name}, ${email}, ${passwordHash})
      RETURNING id
    `;

    req.session.userId = user.id;
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.redirect(returnTo || '/dashboard');
  } catch (err) {
    next(err);
  }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const returnTo = safeReturnTo(req.query.returnTo);
  if (returnTo) req.session.returnTo = returnTo;
  res.render('auth/login', { error: null, values: { email: '' } });
});

router.post('/login', async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  try {
    const [user] = await sql`SELECT id, password_hash FROM users WHERE email = ${email}`;
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!valid) {
      return res.status(400).render('auth/login', {
        error: res.locals.t('auth.error_invalid_credentials'),
        values: { email },
      });
    }

    req.session.userId = user.id;
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.redirect(returnTo || '/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
