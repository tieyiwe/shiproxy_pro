-- Package intake and status tracking for listers, plus a public no-login
-- tracking/pickup-confirmation page keyed on a random access_token (the
-- link the sender shares with the receiver, and the payload of the QR
-- code shown on the package's detail page - any phone's native camera
-- can scan a QR that encodes a URL, so no in-app scanner is needed).

CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_contact TEXT NOT NULL,
  sender_email TEXT,
  receiver_name TEXT NOT NULL,
  weight_kg NUMERIC(10, 2),
  details TEXT,
  amount_charged NUMERIC(12, 2),
  amount_currency TEXT,
  payment_note TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'packed_closed', 'departed', 'delivered')),
  access_token TEXT NOT NULL UNIQUE,
  receiver_notes TEXT,
  receiver_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_container ON packages(container_id);

CREATE TABLE IF NOT EXISTS package_photos (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kept separate from `containers.status` (which governs marketplace
-- availability) - departure is a physical-timeline fact, not a listing
-- state, per the original spec's split between the two concepts.
ALTER TABLE containers ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ;
