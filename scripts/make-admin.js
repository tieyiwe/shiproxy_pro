// One-off bootstrap for the very first platform admin - there's no UI path
// to self-promote (see routes/admin.js), so this is how it's done once,
// from a shell with DATABASE_URL configured:
//
//   node scripts/make-admin.js someone@example.com
//
require('dotenv').config();
const { sql } = require('../db');

async function main() {
  const email = (process.argv[2] || '').trim();
  if (!email) {
    console.error('Usage: node scripts/make-admin.js <email>');
    process.exitCode = 1;
    return;
  }

  const [user] = await sql`
    UPDATE users SET is_admin = true WHERE email = ${email}
    RETURNING id, name, email, is_admin
  `;

  if (!user) {
    console.error(`No user found with email "${email}". They need to sign up first.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${user.name} <${user.email}> (id ${user.id}) is now an admin.`);
}

main()
  .catch((err) => {
    console.error('Failed to grant admin:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
