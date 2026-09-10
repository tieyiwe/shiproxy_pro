const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { supportedLanguages } = require('../lib/i18n');
const { isValidHandle } = require('../lib/validate');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  res.render('account/show', { error: null });
});

router.post('/', async (req, res, next) => {
  try {
    const preferredLang = supportedLanguages.includes(req.body.preferred_lang)
      ? req.body.preferred_lang
      : req.user.preferred_lang;

    const rawHandle = (req.body.handle || '').trim().toLowerCase();
    let handle = req.user.handle || null;

    if (rawHandle && rawHandle !== req.user.handle) {
      if (!isValidHandle(rawHandle)) {
        return res.status(400).render('account/show', {
          error: res.locals.t('account.error_invalid_handle'),
        });
      }
      const [taken] = await sql`SELECT id FROM users WHERE handle = ${rawHandle} AND id != ${req.user.id}`;
      if (taken) {
        return res.status(400).render('account/show', {
          error: res.locals.t('account.error_handle_taken'),
        });
      }
      handle = rawHandle;
    } else if (!rawHandle) {
      handle = null;
    }

    await sql`
      UPDATE users SET preferred_lang = ${preferredLang}, handle = ${handle} WHERE id = ${req.user.id}
    `;
    req.user.preferred_lang = preferredLang;
    req.user.handle = handle;
    res.cookie('lang', preferredLang, { maxAge: 365 * 24 * 60 * 60 * 1000 });

    req.session.flash = { type: 'success', text: res.locals.t('account.saved') };
    res.redirect('/account');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
