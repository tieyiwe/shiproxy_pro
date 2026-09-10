const express = require('express');

const router = express.Router();

router.get('/terms', (req, res) => {
  res.render('legal/terms', { title: res.locals.t('legal.terms_title') });
});

router.get('/privacy', (req, res) => {
  res.render('legal/privacy', { title: res.locals.t('legal.privacy_title') });
});

router.get('/guide', (req, res) => {
  res.render('legal/guide', { title: res.locals.t('legal.guide_title') });
});

module.exports = router;
