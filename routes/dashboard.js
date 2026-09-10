const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { trackingUrl } = require('../lib/tracking');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const containers = await sql`
      SELECT * FROM containers WHERE owner_id = ${req.user.id} ORDER BY created_at DESC
    `;
    const decorated = containers.map((c) => ({ ...c, tracking_url: trackingUrl(c.container_number) }));

    res.render('dashboard/index', {
      title: res.locals.t('dashboard.title'),
      containers: decorated,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
