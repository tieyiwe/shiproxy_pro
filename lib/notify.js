const { sql } = require('../db');

// Stores an i18n key + raw vars (never pre-rendered text) so a notification
// always renders in the *recipient's* current language, regardless of the
// language active when the triggering action occurred.
async function createNotification(userId, { type, i18nKey, i18nVars = {}, link = null }) {
  await sql`
    INSERT INTO notifications (user_id, type, i18n_key, i18n_vars, link)
    VALUES (${userId}, ${type}, ${i18nKey}, ${sql.json(i18nVars)}, ${link})
  `;
}

module.exports = { createNotification };
