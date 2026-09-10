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

module.exports = { canManagePackagesFor };
