-- Platform-operator admin flag. There's no self-serve UI path to become an
-- admin (see scripts/make-admin.js for how the first one gets created) -
-- this is deliberately a manual, out-of-band bootstrap step.
--
-- NOTE: adding this column is not enough on its own - middleware/auth.js's
-- loadUser SELECT must also list is_admin, or req.user.is_admin will always
-- read as undefined regardless of what's stored here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
