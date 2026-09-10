const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { deletePhotoFile } = require('../lib/photos');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Reject non-numeric :id early with a clean 404 instead of a Postgres cast
// error, same convention as routes/containers.js / routes/team.js.
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

const PAGE_SIZE = 20;

function parsePage(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Builds a `WHERE (...)` clause matching `term` case-insensitively across
// the given columns, plus the params array to interpolate via sql.unsafe -
// mirrors the buildBrowseWhere() helper in routes/containers.js.
function buildSearchWhere(term, columns) {
  const trimmed = (term || '').trim();
  if (!trimmed) return { where: '', params: [] };
  const pattern = `%${trimmed}%`;
  const conditions = columns.map((col, idx) => `${col} ILIKE $${idx + 1}`);
  return { where: `WHERE (${conditions.join(' OR ')})`, params: columns.map(() => pattern) };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const [
      [{ count: totalUsers }],
      [{ count: signups7d }],
      [{ count: signups30d }],
      [{ count: totalContainers }],
      containersByStatus,
      [{ count: totalPackages }],
      packagesByStatus,
      [{ count: totalTeams }],
      [{ count: totalConversations }],
      [{ count: totalRatings }],
      [{ count: unreadNotifications }],
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM users`,
      sql`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= now() - interval '7 days'`,
      sql`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= now() - interval '30 days'`,
      sql`SELECT COUNT(*)::int AS count FROM containers`,
      sql`SELECT status, COUNT(*)::int AS count FROM containers GROUP BY status ORDER BY status`,
      sql`SELECT COUNT(*)::int AS count FROM packages`,
      sql`SELECT status, COUNT(*)::int AS count FROM packages GROUP BY status ORDER BY status`,
      sql`SELECT COUNT(*)::int AS count FROM teams`,
      sql`SELECT COUNT(*)::int AS count FROM conversations`,
      sql`SELECT COUNT(*)::int AS count FROM ratings`,
      sql`SELECT COUNT(*)::int AS count FROM notifications WHERE read_at IS NULL`,
    ]);

    res.render('admin/dashboard', {
      title: res.locals.t('admin.dashboard_title'),
      stats: {
        totalUsers,
        signups7d,
        signups30d,
        totalContainers,
        containersByStatus,
        totalPackages,
        packagesByStatus,
        totalTeams,
        totalConversations,
        totalRatings,
        unreadNotifications,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

router.get('/users', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const { where, params } = buildSearchWhere(q, ['name', 'email', 'public_id', 'handle']);

    const rows = await sql.unsafe(
      `SELECT id, name, email, public_id, handle, is_admin, created_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    );
    const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM users ${where}`, params);

    res.render('admin/users', {
      title: res.locals.t('admin.users_title'),
      users: rows,
      q,
      page,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const [targetUser] = await sql`
      SELECT id, name, email, public_id, handle, is_admin, preferred_lang, rating_avg, rating_count, created_at
      FROM users WHERE id = ${req.params.id}
    `;
    if (!targetUser) return res.status(404).render('errors/404', { title: '404' });

    const containers = await sql`
      SELECT * FROM containers WHERE owner_id = ${targetUser.id} ORDER BY created_at DESC
    `;
    const containerIds = containers.map((c) => c.id);

    const [packageCountRow] = containerIds.length
      ? await sql`SELECT COUNT(*)::int AS count FROM packages WHERE container_id IN ${sql(containerIds)}`
      : [{ count: 0 }];

    const recentPackages = containerIds.length
      ? await sql`
          SELECT packages.*, containers.container_number, containers.origin_city, containers.destination_city
          FROM packages
          JOIN containers ON containers.id = packages.container_id
          WHERE packages.container_id IN ${sql(containerIds)}
          ORDER BY packages.created_at DESC
          LIMIT 10
        `
      : [];

    const [ownedTeam] = await sql`SELECT * FROM teams WHERE owner_id = ${targetUser.id}`;
    const ownedTeamMembers = ownedTeam
      ? await sql`
          SELECT team_members.*, users.name, users.email, users.public_id
          FROM team_members
          JOIN users ON users.id = team_members.user_id
          WHERE team_members.team_id = ${ownedTeam.id}
          ORDER BY team_members.created_at ASC
        `
      : [];

    const staffMemberships = await sql`
      SELECT team_members.*, teams.name AS team_name, owner.name AS owner_name
      FROM team_members
      JOIN teams ON teams.id = team_members.team_id
      JOIN users owner ON owner.id = teams.owner_id
      WHERE team_members.user_id = ${targetUser.id}
      ORDER BY team_members.created_at DESC
    `;

    res.render('admin/user-detail', {
      title: res.locals.t('admin.user_detail_title'),
      targetUser,
      containers,
      packageCount: packageCountRow.count,
      recentPackages,
      ownedTeam,
      ownedTeamMembers,
      staffMemberships,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/toggle-admin', async (req, res, next) => {
  try {
    const [targetUser] = await sql`SELECT id, is_admin FROM users WHERE id = ${req.params.id}`;
    if (!targetUser) return res.status(404).render('errors/404', { title: '404' });

    // Prevent a lone admin from locking themselves out by mistake.
    if (targetUser.is_admin && targetUser.id === req.user.id) {
      req.session.flash = { type: 'error', text: res.locals.t('admin.cannot_revoke_self') };
      return res.redirect(`/admin/users/${targetUser.id}`);
    }

    await sql`UPDATE users SET is_admin = ${!targetUser.is_admin} WHERE id = ${targetUser.id}`;
    req.session.flash = { type: 'success', text: res.locals.t('admin.role_updated') };
    res.redirect(`/admin/users/${targetUser.id}`);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Container / listing moderation
//
// These are deliberately separate from routes/containers.js rather than
// reusing its owner-scoped handlers, so the per-owner authorization checks
// there never need to be weakened to let an admin through.
// ---------------------------------------------------------------------------

router.get('/containers', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const { where, params } = buildSearchWhere(q, [
      'containers.container_number',
      'containers.origin_city',
      'containers.destination_city',
      'users.name',
      'users.email',
    ]);

    const rows = await sql.unsafe(
      `SELECT containers.*, users.name AS owner_name, users.email AS owner_email
       FROM containers
       JOIN users ON users.id = containers.owner_id
       ${where}
       ORDER BY containers.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    );
    const [{ count }] = await sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM containers JOIN users ON users.id = containers.owner_id ${where}`,
      params
    );

    res.render('admin/containers', {
      title: res.locals.t('admin.containers_title'),
      containers: rows,
      q,
      page,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/close', async (req, res, next) => {
  try {
    const [container] = await sql`SELECT id FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });

    await sql`UPDATE containers SET status = 'closed', updated_at = now() WHERE id = ${container.id}`;
    req.session.flash = { type: 'success', text: res.locals.t('admin.container_closed') };
    res.redirect('/admin/containers');
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/delete', async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });

    const photos = await sql`SELECT * FROM container_photos WHERE container_id = ${container.id}`;
    await sql`DELETE FROM containers WHERE id = ${container.id}`;
    for (const p of photos) deletePhotoFile('containers', p.file_path);

    req.session.flash = { type: 'success', text: res.locals.t('admin.container_deleted') };
    res.redirect('/admin/containers');
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Package oversight (read-only - support/dispute lookups across all owners)
// ---------------------------------------------------------------------------

router.get('/packages', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const { where, params } = buildSearchWhere(q, [
      'packages.sender_name',
      'packages.receiver_name',
      'containers.container_number',
    ]);

    const rows = await sql.unsafe(
      `SELECT packages.*, containers.container_number, containers.origin_city, containers.destination_city,
              users.name AS owner_name
       FROM packages
       JOIN containers ON containers.id = packages.container_id
       JOIN users ON users.id = containers.owner_id
       ${where}
       ORDER BY packages.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    );
    const [{ count }] = await sql.unsafe(
      `SELECT COUNT(*)::int AS count
       FROM packages
       JOIN containers ON containers.id = packages.container_id
       JOIN users ON users.id = containers.owner_id
       ${where}`,
      params
    );

    res.render('admin/packages', {
      title: res.locals.t('admin.packages_title'),
      packages: rows,
      q,
      page,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Team oversight
// ---------------------------------------------------------------------------

router.get('/teams', async (req, res, next) => {
  try {
    const teams = await sql`
      SELECT teams.*, users.name AS owner_name, users.email AS owner_email
      FROM teams
      JOIN users ON users.id = teams.owner_id
      ORDER BY teams.created_at DESC
    `;
    const teamIds = teams.map((t) => t.id);
    const members = teamIds.length
      ? await sql`
          SELECT team_members.*, users.name, users.email, users.public_id
          FROM team_members
          JOIN users ON users.id = team_members.user_id
          WHERE team_members.team_id IN ${sql(teamIds)}
          ORDER BY team_members.created_at ASC
        `
      : [];

    const membersByTeam = new Map();
    for (const m of members) {
      if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
      membersByTeam.get(m.team_id).push(m);
    }
    const decorated = teams.map((t) => ({ ...t, members: membersByTeam.get(t.id) || [] }));

    res.render('admin/teams', {
      title: res.locals.t('admin.teams_title'),
      teams: decorated,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
