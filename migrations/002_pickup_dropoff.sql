-- Pickup policy on a listing, plus extra pickup/drop-off (grouping) points
-- beyond the single origin/destination city already on the listing.

ALTER TABLE containers
  ADD COLUMN IF NOT EXISTS pickup_option TEXT NOT NULL DEFAULT 'dropoff_only'
    CHECK (pickup_option IN ('dropoff_only', 'pickup_free', 'pickup_fee')),
  ADD COLUMN IF NOT EXISTS pickup_fee_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS pickup_fee_currency TEXT;

CREATE TABLE IF NOT EXISTS container_stops (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup', 'dropoff')),
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_container_stops_container ON container_stops(container_id);
