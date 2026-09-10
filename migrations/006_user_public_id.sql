-- Human-friendly account reference (e.g. support conversations, receipts)
-- distinct from the internal serial id.
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id TEXT;

UPDATE users
SET public_id = 'SP' || upper(substr(md5(id::text || clock_timestamp()::text || random()::text), 1, 6))
WHERE public_id IS NULL;

ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
