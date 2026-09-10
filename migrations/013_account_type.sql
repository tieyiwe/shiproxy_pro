-- Captures who's signing up (expediter/customer vs. a business running
-- shipments) so the signup form can ask for the right details up front.
-- This is profile data only - it doesn't gate what a user can do in the
-- app, which stays behavior-based (anyone can post a listing or ship).
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'expediter';
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_location TEXT;
