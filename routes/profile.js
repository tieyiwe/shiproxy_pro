const express = require('express');
const { sql } = require('../db');
const { trackingUrl } = require('../lib/tracking');
const { DEFAULT_BROWSE_STATUSES } = require('../data/reference');

const router = express.Router();

router.get('/u/:handle', async (req, res, next) => {
  try {
    const handle = req.params.handle.toLowerCase();
    const [profileUser] = await sql`
      SELECT id, name, handle, rating_avg, rating_count FROM users WHERE handle = ${handle}
    `;
    if (!profileUser) return res.status(404).render('errors/404', { title: '404' });

    const containers = await sql`
      SELECT * FROM containers
      WHERE owner_id = ${profileUser.id} AND status IN ${sql(DEFAULT_BROWSE_STATUSES)}
      ORDER BY featured DESC, created_at DESC
    `;

    const photoRows = containers.length
      ? await sql`
          SELECT * FROM container_photos WHERE container_id IN ${sql(containers.map((c) => c.id))} ORDER BY container_id, position ASC
        `
      : [];
    const photosByContainer = new Map();
    for (const row of photoRows) {
      if (!photosByContainer.has(row.container_id)) photosByContainer.set(row.container_id, []);
      photosByContainer.get(row.container_id).push(row);
    }

    const listings = containers.map((c) => {
      const photos = photosByContainer.get(c.id) || [];
      return {
        ...c,
        photos,
        thumbnail: photos[0] ? `/uploads/containers/${photos[0].file_path}` : null,
        tracking_url: trackingUrl(c.container_number),
        distance_km: null,
      };
    });

    const baseUrl = res.locals.baseUrl;
    const og = {
      title: `${profileUser.name}'s ShipBox`,
      description: res.locals.t('profile.og_description'),
      url: `${baseUrl}/u/${profileUser.handle}`,
      image: listings.find((l) => l.thumbnail)?.thumbnail
        ? `${baseUrl}${listings.find((l) => l.thumbnail).thumbnail}`
        : `${baseUrl}/images/og-fallback.png`,
    };

    res.render('profile/show', {
      title: og.title,
      og,
      profileUser,
      listings,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
