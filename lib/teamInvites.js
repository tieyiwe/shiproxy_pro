const crypto = require('crypto');
const { sql } = require('../db');
const { TEAM_PLAN_SEATS } = require('../data/reference');

const TOKEN_RE = /^[0-9a-f]{48}$/;

function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Emails are stored lowercased at signup, so every comparison against a
// stored address has to go through here or an invitation sent to
// "Yaw@example.com" would never match its own account.
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function loadInviteByToken(token) {
  if (!TOKEN_RE.test(token || '')) return null;

  const [invite] = await sql`
    SELECT team_members.*, teams.plan, teams.owner_id, teams.name AS team_name, owner.name AS owner_name
    FROM team_members
    JOIN teams ON teams.id = team_members.team_id
    JOIN users owner ON owner.id = teams.owner_id
    WHERE team_members.invite_token = ${token}
  `;
  return invite || null;
}

// Returns 'joined' | 'invalid' | 'wrong_account' | 'seats_full' rather than
// throwing: each caller (the token page, the in-app invitation list, the
// post-signup hook) turns the outcome into its own message.
async function acceptInvitation(invite, user) {
  if (!invite || invite.status !== 'pending') return 'invalid';
  if (invite.owner_id === user.id) return 'invalid';

  // Holding the token is not enough - the signed-in account must be the one
  // the invitation was addressed to, or a leaked link would let anyone
  // attach their own account to someone else's team.
  const ownsInvitedAccount = invite.user_id === null || invite.user_id === user.id;
  const ownsInvitedEmail = invite.invited_email
    ? normalizeEmail(invite.invited_email) === normalizeEmail(user.email)
    : invite.user_id === user.id;
  if (!ownsInvitedAccount || !ownsInvitedEmail) return 'wrong_account';

  return sql.begin(async (tx) => {
    // Locking the team serialises concurrent accepts, so two invitations
    // racing for the last seat can't both pass the seat check below.
    await tx`SELECT id FROM teams WHERE id = ${invite.team_id} FOR UPDATE`;

    const [{ count }] = await tx`
      SELECT COUNT(*)::int AS count
      FROM team_members
      WHERE team_id = ${invite.team_id} AND status = 'active'
    `;
    // Seats count the owner, plus the active staff, plus this membership.
    if (count + 2 > TEAM_PLAN_SEATS[invite.plan]) return 'seats_full';

    // The same person can hold both an account-ID invitation and an email
    // one for a team; they'd collide on (team_id, user_id), so the
    // invitation being accepted supersedes the other row.
    await tx`
      DELETE FROM team_members
      WHERE team_id = ${invite.team_id} AND user_id = ${user.id} AND id <> ${invite.id}
    `;

    const rows = await tx`
      UPDATE team_members
      SET user_id = ${user.id}, status = 'active'
      WHERE id = ${invite.id} AND status = 'pending'
      RETURNING id
    `;
    return rows.length > 0 ? 'joined' : 'invalid';
  });
}

module.exports = { generateInviteToken, normalizeEmail, loadInviteByToken, acceptInvitation };
