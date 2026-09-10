const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { supportedLanguages } = require('../lib/i18n');
const { isValidHandle } = require('../lib/validate');
const { ACCOUNT_TYPES, BUSINESS_ACCOUNT_TYPES } = require('../data/reference');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [profile] = await sql`
      SELECT account_type, business_name, business_contact_name, business_phone, business_location
      FROM users WHERE id = ${req.user.id}
    `;
    res.render('account/show', { error: null, profile });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const preferredLang = supportedLanguages.includes(req.body.preferred_lang)
      ? req.body.preferred_lang
      : req.user.preferred_lang;

    const rawHandle = (req.body.handle || '').trim().toLowerCase();
    let handle = req.user.handle || null;

    const renderError = async (error) => {
      const [profile] = await sql`
        SELECT account_type, business_name, business_contact_name, business_phone, business_location
        FROM users WHERE id = ${req.user.id}
      `;
      res.status(400).render('account/show', { error, profile });
    };

    if (rawHandle && rawHandle !== req.user.handle) {
      if (!isValidHandle(rawHandle)) {
        return await renderError(res.locals.t('account.error_invalid_handle'));
      }
      const [taken] = await sql`SELECT id FROM users WHERE handle = ${rawHandle} AND id != ${req.user.id}`;
      if (taken) {
        return await renderError(res.locals.t('account.error_handle_taken'));
      }
      handle = rawHandle;
    } else if (!rawHandle) {
      handle = null;
    }

    const accountType = ACCOUNT_TYPES.includes(req.body.account_type) ? req.body.account_type : req.user.account_type;
    const isBusiness = BUSINESS_ACCOUNT_TYPES.includes(accountType);
    const businessName = isBusiness ? (req.body.business_name || '').trim() : null;
    if (isBusiness && !businessName) {
      return await renderError(res.locals.t('auth.error_business_name_required'));
    }
    const businessContactName = isBusiness ? (req.body.business_contact_name || '').trim() || null : null;
    const businessPhone = isBusiness ? (req.body.business_phone || '').trim() || null : null;
    const businessLocation = isBusiness ? (req.body.business_location || '').trim() || null : null;

    await sql`
      UPDATE users SET
        preferred_lang = ${preferredLang}, handle = ${handle}, account_type = ${accountType},
        business_name = ${businessName}, business_contact_name = ${businessContactName},
        business_phone = ${businessPhone}, business_location = ${businessLocation}
      WHERE id = ${req.user.id}
    `;
    req.user.preferred_lang = preferredLang;
    req.user.handle = handle;
    req.user.account_type = accountType;
    res.cookie('lang', preferredLang, { maxAge: 365 * 24 * 60 * 60 * 1000 });

    req.session.flash = { type: 'success', text: res.locals.t('account.saved') };
    res.redirect('/account');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
