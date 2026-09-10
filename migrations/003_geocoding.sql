-- Cached coordinates for "distance from me" search, populated lazily at
-- listing create/edit time (see lib/geocode.js) rather than looked up live
-- on every browse request.

ALTER TABLE containers
  ADD COLUMN IF NOT EXISTS origin_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS origin_lng NUMERIC(9, 6);
