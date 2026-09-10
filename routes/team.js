const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { TEAM_PLAN_SEATS } = require('../data/reference');
const { createNotification } = require('../lib/notify');

const router = express.Router();

router.use(requireAuth);

router.param('memberId', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const invitations = await sql`
      SELECT team_members.*, teams.name AS team_name, owner.name AS owner_name
      FROM team_members
      JOIN teams ON teams.id = team_members.team_id
      JOIN users owner ON owner.id = teams.owner_id
      WHERE team_members.user_id = ${req.user.id} AND team_members.status = 'pending'
      ORDER BY team_members.created_at DESC
    `;

    const [myTeam] = await sql`SELECT * FROM teams WHERE owner_id = ${req.user.id}`;
    let members = [];
    if (myTeam) {
      members = await sql`
        SELECT team_members.*, users.name, users.public_id
        FROM team_members
        JOIN users ON users.id = team_members.user_id
        WHERE team_members.team_id = ${myTeam.id}
        ORDER BY team_members.created_at ASC
      `;
    }

    const [staffOn] = await sql`
      SELECT teams.*, owner.name AS owner_name
      FROM team_members
      JOIN teams ON teams.id = team_members.team_id
      JOIN users owner ON owner.id = teams.owner_id
      WHERE team_members.user_id = ${req.user.id} AND team_members.status = 'active'
    `;

    res.render('team/show', {
      title: res.locals.t('team.title'),
      invitations,
      myTeam,
      members,
      staffOn: staffOn || null,
      seatLimit: myTeam ? TEAM_PLAN_SEATS[myTeam.plan] : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/invite', async (req, res, next) => {
  try {
    const publicId = (req.body.public_id || '').trim().toUpperCase();
    const [target] = await sql`SELECT id, name FROM users WHERE public_id = ${publicId}`;

    if (!target) {
      req.session.flash = { type: 'error', text: res.locals.t('team.error_not_found') };
      return res.redirect('/team');
    }
    if (target.id === req.user.id) {
      req.session.flash = { type: 'error', text: res.locals.t('team.error_self') };
      return res.redirect('/team');
    }

    let [team] = await sql`SELECT * FROM teams WHERE owner_id = ${req.user.id}`;
    if (!team) {
      [team] = await sql`
        INSERT INTO teams (owner_id, name) VALUES (${req.user.id}, ${res.locals.t('team.default_name', { name: req.user.name })})
        RETURNING *
      `;
    }

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = ${team.id} AND status IN ('pending', 'active')
    `;
    const seatLimit = TEAM_PLAN_SEATS[team.plan];
    if (count + 1 >= seatLimit) {
      req.session.flash = { type: 'error', text: res.locals.t('team.error_seats_full') };
      return res.redirect('/team');
    }

    await sql`
      INSERT INTO team_members (team_id, user_id, role, status)
      VALUES (${team.id}, ${target.id}, 'staff', 'pending')
      ON CONFLICT (team_id, user_id) DO UPDATE SET status = 'pending', role = 'staff'
    `;

    await createNotification(target.id, {
      type: 'team_invite',
      i18nKey: 'notifications.team_invite',
      i18nVars: { name: req.user.name },
      link: '/team',
    });

    req.session.flash = { type: 'success', text: res.locals.t('team.invited', { name: target.name }) };
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/invitations/:memberId/accept', async (req, res, next) => {
  try {
    await sql`
      UPDATE team_members SET status = 'active'
      WHERE id = ${req.params.memberId} AND user_id = ${req.user.id} AND status = 'pending'
    `;
    req.session.flash = { type: 'success', text: res.locals.t('team.joined') };
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/invitations/:memberId/decline', async (req, res, next) => {
  try {
    await sql`
      DELETE FROM team_members WHERE id = ${req.params.memberId} AND user_id = ${req.user.id} AND status = 'pending'
    `;
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/members/:memberId/remove', async (req, res, next) => {
  try {
    const [myTeam] = await sql`SELECT * FROM teams WHERE owner_id = ${req.user.id}`;
    if (!myTeam) return res.status(403).send('Forbidden');

    await sql`DELETE FROM team_members WHERE id = ${req.params.memberId} AND team_id = ${myTeam.id}`;
    req.session.flash = { type: 'success', text: res.locals.t('team.removed') };
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
