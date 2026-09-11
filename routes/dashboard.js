const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { trackingUrl } = require('../lib/tracking');
const { BUSINESS_ACCOUNT_TYPES } = require('../data/reference');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownContainers = await sql`
      SELECT * FROM containers WHERE owner_id = ${req.user.id} ORDER BY created_at DESC
    `;
    const ownContainerIds = ownContainers.map((c) => c.id);

    // Business accounts (shipping companies / independent shippers) get a
    // per-listing view of how much interest each one is getting, so they
    // can tell a quiet listing from a busy one at a glance.
    const isBusinessAccount = BUSINESS_ACCOUNT_TYPES.includes(req.user.account_type);
    let inquiryCountByContainer = new Map();
    let packageCountByContainer = new Map();
    if (isBusinessAccount && ownContainerIds.length > 0) {
      const [inquiryRows, packageRows] = await Promise.all([
        sql`SELECT container_id, COUNT(*)::int AS count FROM conversations WHERE container_id IN ${sql(ownContainerIds)} GROUP BY container_id`,
        sql`SELECT container_id, COUNT(*)::int AS count FROM packages WHERE container_id IN ${sql(ownContainerIds)} GROUP BY container_id`,
      ]);
      inquiryCountByContainer = new Map(inquiryRows.map((r) => [r.container_id, r.count]));
      packageCountByContainer = new Map(packageRows.map((r) => [r.container_id, r.count]));
    }

    const decorated = ownContainers.map((c) => ({
      ...c,
      tracking_url: trackingUrl(c.container_number),
      isStaffManaged: false,
      inquiryCount: inquiryCountByContainer.get(c.id) || 0,
      packageCount: packageCountByContainer.get(c.id) || 0,
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

    // Analytics summary for business accounts, scoped to containers they
    // actually own (not staff-managed ones, which belong to someone else's
    // business). Revenue is grouped by currency since packages under
    // different listings can be priced in different ones.
    let analytics = null;
    if (isBusinessAccount) {
      const activeCount = decorated.filter((c) => c.status !== 'closed').length;
      const closedCount = decorated.filter((c) => c.status === 'closed').length;
      const totalInquiries = decorated.reduce((sum, c) => sum + c.inquiryCount, 0);

      const packagesByStatus = ownContainerIds.length
        ? await sql`
            SELECT status, COUNT(*)::int AS count FROM packages
            WHERE container_id IN ${sql(ownContainerIds)}
            GROUP BY status
          `
        : [];
      const totalPackages = packagesByStatus.reduce((sum, r) => sum + r.count, 0);

      const revenueByCurrency = ownContainerIds.length
        ? await sql`
            SELECT amount_currency, SUM(amount_charged) AS total
            FROM packages
            WHERE container_id IN ${sql(ownContainerIds)} AND amount_charged IS NOT NULL
            GROUP BY amount_currency
            ORDER BY amount_currency
          `
        : [];

      analytics = {
        activeListings: activeCount,
        closedListings: closedCount,
        totalPackages,
        packagesByStatus,
        totalInquiries,
        revenueByCurrency,
      };
    }

    res.render('dashboard/index', {
      title: res.locals.t('dashboard.title'),
      containers: [...decorated, ...decoratedStaff],
      recentConversations,
      myShipments,
      isBusinessAccount,
      analytics,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
