// Deletes everything created by scripts/seed-sample-data.js: the demo
// listings (container numbers starting with "DEMO-", which cascades to
// their photos/stops/conversations/messages/packages) and the demo
// accounts (@sample.shiproxy.demo emails).
//
//   node scripts/remove-sample-data.js
//
require('dotenv').config();
const { sql } = require('../db');

const DEMO_EMAIL_DOMAIN = 'sample.shiproxy.demo';

async function main() {
  const removedContainers = await sql`
    DELETE FROM containers WHERE container_number LIKE 'DEMO-%' RETURNING container_number
  `;
  const removedUsers = await sql`
    DELETE FROM users WHERE email LIKE ${'%@' + DEMO_EMAIL_DOMAIN} RETURNING email
  `;

  console.log(`Removed ${removedContainers.length} sample listing(s).`);
  console.log(`Removed ${removedUsers.length} sample account(s).`);
  if (removedContainers.length === 0 && removedUsers.length === 0) {
    console.log('Nothing to remove - sample data was not present.');
  }
}

main()
  .catch((err) => {
    console.error('Failed to remove sample data:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
