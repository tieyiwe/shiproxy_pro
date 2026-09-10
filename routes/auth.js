const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { sql } = require('../db');
const { isValidEmail, isValidPassword } = require('../lib/validate');
const { generatePublicId } = require('../lib/publicId');
const { supportedLanguages } = require('../lib/i18n');

const router = express.Router();

// Limits credential-guessing and signup-spam without needing a CAPTCHA:
// keyed per-IP (trust proxy is set in server.js so this reads the real
// client IP behind Replit's reverse proxy, not the proxy's own address).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// A precomputed hash with no matching password - compared against on a
// login attempt for an email that doesn't exist, so the response takes
// the same time either way. Without this, bcrypt.compare only runs when
// the user is found, and its ~100ms cost becomes a timing side-channel
// an attacker can use to enumerate which emails have accounts.
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i9Q9pJ.KP.OeUSVKe6XZjOwR.wqZC';

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

router.post('/signup', authLimiter, async (req, res, next) => {
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
    const preferredLang = supportedLanguages.includes(req.body.preferred_lang)
      ? req.body.preferred_lang
      : res.locals.lang;

    // Collision odds are negligible (32^6 combinations) but the column is
    // UNIQUE, so retry with a fresh id on the rare conflict rather than
    // trusting a single guess.
    let user;
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      try {
        [user] = await sql`
          INSERT INTO users (name, email, password_hash, public_id, preferred_lang)
          VALUES (${name}, ${email}, ${passwordHash}, ${generatePublicId()}, ${preferredLang})
          RETURNING id
        `;
      } catch (err) {
        if (err.code !== '23505' || attempt === 4) throw err;
      }
    }

    req.session.userId = user.id;
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.cookie('lang', preferredLang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
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

router.post('/login', authLimiter, async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  try {
    const [user] = await sql`SELECT id, password_hash FROM users WHERE email = ${email}`;
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);

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
