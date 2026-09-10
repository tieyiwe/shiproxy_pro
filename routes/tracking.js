const express = require('express');
const { sql } = require('../db');

const router = express.Router();

async function loadPackageByToken(token) {
  const [pkg] = await sql`
    SELECT packages.*, containers.origin_city, containers.origin_country,
           containers.destination_city, containers.destination_country,
           containers.container_number
    FROM packages
    JOIN containers ON containers.id = packages.container_id
    WHERE packages.access_token = ${token}
  `;
  return pkg || null;
}

router.get('/track/:token', async (req, res, next) => {
  try {
    const pkg = await loadPackageByToken(req.params.token);
    if (!pkg) return res.status(404).render('errors/404', { title: '404' });

    res.render('tracking/show', {
      title: res.locals.t('packages.tracking_title'),
      pkg,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/track/:token/confirm', async (req, res, next) => {
  try {
    const pkg = await loadPackageByToken(req.params.token);
    if (!pkg) return res.status(404).render('errors/404', { title: '404' });

    if (pkg.status !== 'delivered') {
      await sql`
        UPDATE packages SET
          status = 'delivered',
          receiver_notes = ${(req.body.receiver_notes || '').trim() || null},
          receiver_confirmed_at = now(),
          updated_at = now()
        WHERE id = ${pkg.id}
      `;
    }

    res.redirect(`/track/${req.params.token}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
