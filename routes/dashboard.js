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

    // Every user lands here regardless of whether they've ever posted a
    // listing - so alongside "my listings" (groupeur side), also surface
    // recent conversations and shipments sent (shipper side). Packages
    // aren't linked to a user_id (see packages intake - sender is often
    // unregistered), so shipments are matched by the logged-in user's own
    // email against what the shipping agent recorded.
    const recentConversations = await sql`
      SELECT
        conversations.id, containers.origin_city, containers.destination_city, containers.container_number,
        (SELECT body FROM messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS last_at,
        CASE WHEN conversations.owner_id = ${req.user.id} THEN shipper.name ELSE owner.name END AS other_name
      FROM conversations
      JOIN containers ON containers.id = conversations.container_id
      JOIN users owner ON owner.id = conversations.owner_id
      JOIN users shipper ON shipper.id = conversations.shipper_id
      WHERE conversations.owner_id = ${req.user.id} OR conversations.shipper_id = ${req.user.id}
      ORDER BY last_at DESC NULLS LAST, conversations.created_at DESC
      LIMIT 4
    `;

    // sender_email is free-typed by whichever agent logs the package, so it
    // isn't guaranteed to match this account's stored (lowercased) email in
    // case - compare case-insensitively or real shipments silently vanish.
    const myShipments = await sql`
      SELECT packages.id, packages.status, packages.access_token, packages.created_at,
             containers.origin_city, containers.destination_city, containers.container_number
      FROM packages
      JOIN containers ON containers.id = packages.container_id
      WHERE lower(packages.sender_email) = ${req.user.email}
      ORDER BY packages.created_at DESC
      LIMIT 4
    `;

    res.render('dashboard/index', {
      title: res.locals.t('dashboard.title'),
      containers: [...decorated, ...decoratedStaff],
      recentConversations,
      myShipments,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
