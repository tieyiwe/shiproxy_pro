-- In-app notifications only for now (see lib/mailer.js for the same
-- "no provider chosen yet" situation with email) - stores an i18n key +
-- vars rather than pre-rendered text, so a notification always displays
-- in the *recipient's* current language, not the language the triggering
-- action happened to occur in.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  i18n_key TEXT NOT NULL,
  i18n_vars JSONB NOT NULL DEFAULT '{}',
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);
