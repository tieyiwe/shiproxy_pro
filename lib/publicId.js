const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L) since this is meant
// to be read aloud or retyped by a person (support calls, receipts).
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePublicId() {
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CHARSET[bytes[i] % CHARSET.length];
  }
  return `SP${suffix}`;
}

module.exports = { generatePublicId };
