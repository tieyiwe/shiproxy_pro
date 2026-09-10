const { sql } = require('../db');

// True for the container's own owner, or an active staff member of that
// owner's team. Used to gate package management (not container edit/
// delete/close, which stay owner-only per the owner/staff privilege split).
async function canManagePackagesFor(userId, containerOwnerId) {
  if (userId === containerOwnerId) return true;

  const [row] = await sql`
    SELECT 1
    FROM team_members
    JOIN teams ON teams.id = team_members.team_id
    WHERE team_members.user_id = ${userId}
      AND team_members.status = 'active'
      AND teams.owner_id = ${containerOwnerId}
  `;
  return !!row;
}

// User ids of the owner's active staff (excludes the owner). Used to notify
// staff of status changes the owner triggers themselves, since owner-only
// actions like close/reopen/depart wouldn't otherwise reach anyone else who
// helps manage that owner's packages.
async function activeStaffIds(ownerId) {
  const rows = await sql`
    SELECT team_members.user_id
    FROM team_members
    JOIN teams ON teams.id = team_members.team_id
    WHERE teams.owner_id = ${ownerId} AND team_members.status = 'active'
  `;
  return rows.map((r) => r.user_id);
}

module.exports = { canManagePackagesFor, activeStaffIds };
