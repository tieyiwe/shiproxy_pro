const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { trackingUrl } = require('../lib/tracking');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownContainers = await sql`
      SELECT * FROM containers WHERE owner_id = ${req.user.id} ORDER BY created_at DESC
    `;
    const decorated = ownContainers.map((c) => ({
      ...c,
      tracking_url: trackingUrl(c.container_number),
      isStaffManaged: false,
    }));

    // Active staff also see (read + packages only) the listings of every
    // team they've joined, so they can log/confirm packages on the
    // company's behalf without needing owner-level access.
    const staffContainers = await sql`
      SELECT containers.*
      FROM team_members
      JOIN teams ON teams.id = team_members.team_id
      JOIN containers ON containers.owner_id = teams.owner_id
      WHERE team_members.user_id = ${req.user.id} AND team_members.status = 'active'
      ORDER BY containers.created_at DESC
    `;
    const decoratedStaff = staffContainers.map((c) => ({
      ...c,
      tracking_url: trackingUrl(c.container_number),
      isStaffManaged: true,
    }));

    res.render('dashboard/index', {
      title: res.locals.t('dashboard.title'),
      containers: [...decorated, ...decoratedStaff],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
