-- Confirmed once at signup rather than only inferred from a cookie, so it
-- follows the user across devices/browsers once logged in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_lang TEXT;
