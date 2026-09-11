const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { TEAM_PLAN_SEATS } = require('../data/reference');
const { createNotification } = require('../lib/notify');
const { sendMail } = require('../lib/mailer');
const { isValidEmail } = require('../lib/validate');
const {
  generateInviteToken,
  normalizeEmail,
  loadInviteByToken,
  acceptInvitation,
} = require('../lib/teamInvites');

const router = express.Router();

router.param('memberId', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

function renderInvitation(res, status, locals) {
  return res.status(status).render('team/invite', {
    title: res.locals.t('team.invite_page_title'),
    invitation: null,
    mismatch: false,
    ...locals,
  });
}

async function ensureTeam(req, res) {
  const [existing] = await sql`SELECT * FROM teams WHERE owner_id = ${req.user.id}`;
  if (existing) return existing;

  const [created] = await sql`
    INSERT INTO teams (owner_id, name)
    VALUES (${req.user.id}, ${res.locals.t('team.default_name', { name: req.user.name })})
    RETURNING *
  `;
  return created;
}

async function hasFreeSeat(team) {
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM team_members
    WHERE team_id = ${team.id} AND status IN ('pending', 'active')
  `;
  return count + 1 < TEAM_PLAN_SEATS[team.plan];
}

// Public on purpose: the recipient of an emailed invitation may not be
// signed in, and may not have an account at all yet.
router.get('/invite/:token', async (req, res, next) => {
  try {
    const invite = await loadInviteByToken(req.params.token);

    if (invite && invite.status === 'active' && req.user && invite.user_id === req.user.id) {
      req.session.flash = { type: 'success', text: res.locals.t('team.already_member') };
      return res.redirect('/team');
    }
    if (!invite || invite.status !== 'pending' || !invite.invited_email) {
      return renderInvitation(res, 404, {});
    }

    if (!req.user) {
      req.session.returnTo = `/team/invite/${invite.invite_token}`;
      const [account] = await sql`SELECT id FROM users WHERE email = ${invite.invited_email}`;
      if (account) return res.redirect('/login');

      // Remembered so signing up finishes the invitation by itself - the
      // whole point of the emailed link is that nobody has to relay an
      // account ID by hand.
      req.session.teamInviteToken = invite.invite_token;
      return res.redirect(`/signup?email=${encodeURIComponent(invite.invited_email)}`);
    }

    renderInvitation(res, 200, {
      invitation: invite,
      mismatch: normalizeEmail(invite.invited_email) !== normalizeEmail(req.user.email),
    });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

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
        LEFT JOIN users ON users.id = team_members.user_id
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

    const team = await ensureTeam(req, res);

    if (!(await hasFreeSeat(team))) {
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

router.post('/invite-email', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const fail = (key) => {
      req.session.flash = { type: 'error', text: res.locals.t(key) };
      res.redirect('/team');
    };

    if (!isValidEmail(email)) return fail('team.error_invalid_email');
    if (email === normalizeEmail(req.user.email)) return fail('team.error_self');

    const team = await ensureTeam(req, res);
    const [target] = await sql`SELECT id, name FROM users WHERE email = ${email}`;

    const [duplicate] = await sql`
      SELECT id FROM team_members
      WHERE team_id = ${team.id}
        AND (invited_email = ${email} OR user_id = ${target ? target.id : null})
    `;
    if (duplicate) return fail('team.error_already_invited');
    if (!(await hasFreeSeat(team))) return fail('team.error_seats_full');

    const token = generateInviteToken();
    await sql`
      INSERT INTO team_members (team_id, user_id, role, status, invited_email, invite_token)
      VALUES (${team.id}, ${target ? target.id : null}, 'staff', 'pending', ${email}, ${token})
    `;

    if (target) {
      await createNotification(target.id, {
        type: 'team_invite',
        i18nKey: 'notifications.team_invite',
        i18nVars: { name: req.user.name },
        link: '/team',
      });
    }

    // The invitation is already saved, so a mail failure must not undo it -
    // the link is logged and shown on the team page for the owner to pass
    // on by hand while no SMTP provider is configured.
    const inviteUrl = `${res.locals.baseUrl}/team/invite/${token}`;
    sendMail({
      to: email,
      subject: res.locals.t('team.email_subject', { team: team.name }),
      text: res.locals.t('team.email_body', { owner: req.user.name, team: team.name, url: inviteUrl }),
    }).catch((err) => {
      console.error(`[team] invitation email to ${email} failed (${err.message}) - link: ${inviteUrl}`);
    });

    req.session.flash = { type: 'success', text: res.locals.t('team.invited_email', { email }) };
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/invite/:token/accept', async (req, res, next) => {
  try {
    const invite = await loadInviteByToken(req.params.token);
    const outcome = await acceptInvitation(invite, req.user);

    if (outcome === 'joined') {
      req.session.flash = { type: 'success', text: res.locals.t('team.joined') };
    } else if (outcome === 'seats_full') {
      req.session.flash = { type: 'error', text: res.locals.t('team.error_seats_full') };
    } else if (outcome === 'wrong_account') {
      req.session.flash = {
        type: 'error',
        text: res.locals.t('team.invite_wrong_account', { email: invite.invited_email }),
      };
    } else {
      req.session.flash = { type: 'error', text: res.locals.t('team.invite_invalid') };
    }
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/invite/:token/decline', async (req, res, next) => {
  try {
    const invite = await loadInviteByToken(req.params.token);
    const isRecipient =
      invite &&
      invite.status === 'pending' &&
      normalizeEmail(invite.invited_email) === normalizeEmail(req.user.email);

    if (isRecipient) {
      await sql`DELETE FROM team_members WHERE id = ${invite.id} AND status = 'pending'`;
      req.session.flash = { type: 'success', text: res.locals.t('team.invite_declined') };
    }
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

router.post('/invitations/:memberId/accept', async (req, res, next) => {
  try {
    const [invite] = await sql`
      SELECT team_members.*, teams.plan, teams.owner_id
      FROM team_members
      JOIN teams ON teams.id = team_members.team_id
      WHERE team_members.id = ${req.params.memberId} AND team_members.user_id = ${req.user.id}
    `;
    const outcome = await acceptInvitation(invite, req.user);

    if (outcome === 'joined') {
      req.session.flash = { type: 'success', text: res.locals.t('team.joined') };
    } else if (outcome === 'seats_full') {
      req.session.flash = { type: 'error', text: res.locals.t('team.error_seats_full') };
    }
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

    const [removed] = await sql`
      DELETE FROM team_members
      WHERE id = ${req.params.memberId} AND team_id = ${myTeam.id}
      RETURNING status, invited_email
    `;

    if (removed) {
      const revoked = removed.status === 'pending' && removed.invited_email;
      req.session.flash = {
        type: 'success',
        text: res.locals.t(revoked ? 'team.invite_revoked' : 'team.removed'),
      };
    }
    res.redirect('/team');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
