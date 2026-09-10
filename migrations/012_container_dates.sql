-- The old "departure_date" actually meant "when the listing opens/starts
-- collecting packages" - rename it to opening_date so the name is honest,
-- then reuse "departure_date" for a genuinely new field: the groupeur's
-- estimated ship-out date, which they can keep updating as it firms up
-- until the container is closed.
ALTER TABLE containers RENAME COLUMN departure_date TO opening_date;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS departure_date DATE;
