const postgres = require('postgres');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 10,
});

module.exports = { sql };
