-- A chosen, human-readable public handle (e.g. "fastship-dakar") backing a
-- shareable storefront-style profile URL (/u/:handle), distinct from the
-- opaque SPxxxxxx public_id used for account-to-account lookups (team
-- invites) rather than public sharing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle) WHERE handle IS NOT NULL;
