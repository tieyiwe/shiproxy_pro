require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sql } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set(
    (await sql`SELECT filename FROM schema_migrations`).map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const filePath = path.join(MIGRATIONS_DIR, file);
    const contents = fs.readFileSync(filePath, 'utf8');
    console.log(`Applying migration: ${file}`);
    await sql.unsafe(contents);
    await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`;
  }

  console.log('Migrations up to date.');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sql.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
